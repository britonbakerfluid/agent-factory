import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast';
import { BasketballChallenges, type ChallengeRepository } from '../server/basketball-challenges';
import type { BasketballChallenge, ChallengeState } from '../shared/basketball-challenge';
import { VISITOR_BALL_RIM, visitorShotVelocity } from '../shared/visitor-basketball';

const spot = { x: 1.3, y: 1.05, z: -3.0 };
const make = visitorShotVelocity(spot), miss = visitorShotVelocity(spot, { ...VISITOR_BALL_RIM, x: VISITOR_BALL_RIM.x + 1.2 });
type Sock = WebSocket & { send: ReturnType<typeof vi.fn> };
function memory(): ChallengeRepository & { rows: Map<string, unknown>; saves: number } {
  const rows = new Map<string, unknown>();
  return { rows, saves: 0,
    loadChallenges: async () => structuredClone([...rows.values()]),
    async saveChallenges(list) { this.saves++; for (const game of list) rows.set(game.id, structuredClone(game)); },
    async deleteChallenges(ids) { for (const id of ids) rows.delete(id); } };
}
function setup(repository = memory()) {
  let time = 1_000_000;
  const broadcast = new BroadcastManager();
  const people: Record<string, { ownerId: string; name: string }> = { alice: { ownerId: 'alice', name: 'Alice' }, bob: { ownerId: 'bob', name: 'Bob' }, 'legacy:Cass': { ownerId: 'legacy:Cass', name: 'Cass' } };
  const manager = new BasketballChallenges(repository, broadcast, id => people[id], () => time);
  const socket = (ownerId?: string) => {
    const s = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() }) as unknown as Sock;
    broadcast.add(s); if (ownerId) broadcast.authenticateSocket(s, { ownerId, username: people[ownerId]?.name ?? ownerId });
    manager.sendActive(s); return s;
  };
  const messages = (s: Sock) => s.send.mock.calls.map(([raw]) => JSON.parse(raw as string));
  const last = (s: Sock, type: string) => messages(s).filter(m => m.type === type).at(-1);
  const game = (s: Sock) => (last(s, 'challenge_state') as ChallengeState).challenges[0];
  const advance = (ms: number) => { time += ms; };
  const shoot = (s: Sock, id: string, velocity: typeof make, position = spot) => { advance(500); manager.receive(s, { type: 'challenge', action: 'shot', id, revision: game(s).revision, position, velocity }); return last(s, 'challenge_result'); };
  return { manager, repository, socket, messages, last, game, advance, shoot };
}

describe('HORSE over websockets', () => {
  it('carries a set shot to an offline opponent, restores across a restart on every device, and plays a matched turn', async () => {
    const s = setup(); await s.manager.initialize();
    const alice = s.socket('alice');
    s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    const id = s.last(alice, 'challenge_result').id as string;
    expect(s.shoot(alice, id, make)).toMatchObject({ success: true, made: true });
    expect(s.game(alice).turn).toMatchObject({ shooter: 'bob', role: 'match', spot: { x: spot.x, z: spot.z } });
    await s.manager.flush();
    s.advance(2 * 24 * 3600 * 1000);
    const restarted = setup(s.repository); await restarted.manager.initialize();
    const phone = restarted.socket('bob'), laptop = restarted.socket('bob');
    for (const device of [phone, laptop]) expect(restarted.game(device)).toMatchObject({ id, status: 'pending', challenger: { name: 'Alice' }, turn: { role: 'match' } });
    expect(restarted.shoot(phone, id, make)).toMatchObject({ success: false, error: expect.stringMatching(/Accept/) });
    restarted.advance(300); restarted.manager.receive(phone, { type: 'challenge', action: 'respond', id, accept: true });
    expect(restarted.game(laptop).status).toBe('playing');
    expect(restarted.shoot(phone, id, miss)).toMatchObject({ success: true, made: false, letter: 'H' });
    const after = restarted.game(laptop);
    expect(after.challengee.letters).toBe(1); expect(after.turn).toEqual({ shooter: 'bob', role: 'set' });
    const aliceLater = restarted.socket('alice');
    expect(restarted.game(aliceLater)).toMatchObject({ id, status: 'playing', turn: { shooter: 'bob', role: 'set' } });
    await restarted.manager.flush(); expect((restarted.repository.rows.get(id) as BasketballChallenge).challengee.letters).toBe(1);
  });
  it('does not let seen acknowledgements throttle or invalidate the next shot', async () => {
    const s = setup(); await s.manager.initialize();
    const alice = s.socket('alice'), bob = s.socket('bob');
    s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    const id = s.last(alice, 'challenge_result').id as string;
    s.shoot(alice, id, make);
    s.advance(500);
    s.manager.receive(bob, { type: 'challenge', action: 'respond', id, accept: true });
    const revision = s.game(bob).revision;
    s.manager.receive(bob, { type: 'challenge', action: 'seen', id });
    s.manager.receive(bob, { type: 'challenge', action: 'shot', id, revision, position: spot, velocity: make });
    expect(s.last(bob, 'challenge_result')).toMatchObject({ success: true, made: true });
  });
  it('refuses unauthenticated, unknown, legacy, hurried, out-of-turn and repeated shots', async () => {
    const s = setup(); await s.manager.initialize();
    const guest = s.socket(), alice = s.socket('alice'), bob = s.socket('bob');
    s.manager.receive(guest, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    expect(s.last(guest, 'challenge_result')).toMatchObject({ success: false, error: expect.stringMatching(/Connect/) });
    s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'nobody' });
    expect(s.last(alice, 'challenge_result').error).toMatch(/team list/);
    s.advance(200); s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'legacy:Cass' });
    expect(s.last(alice, 'challenge_result').error).toMatch(/cannot play/);
    s.advance(200); s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    const id = s.last(alice, 'challenge_result').id as string;
    const revision = s.game(alice).revision;
    expect(s.shoot(bob, id, make)).toMatchObject({ success: false, error: expect.stringMatching(/not your shot/) });
    s.advance(200); s.manager.receive(alice, { type: 'challenge', action: 'shot', id, revision, position: spot, velocity: make });
    expect(s.last(alice, 'challenge_result')).toMatchObject({ success: true, made: true });
    s.advance(100); s.manager.receive(alice, { type: 'challenge', action: 'shot', id, revision, position: spot, velocity: make });
    expect(s.last(alice, 'challenge_result').error).toMatch(/One moment|moment/);
    s.advance(600); s.manager.receive(alice, { type: 'challenge', action: 'shot', id, revision, position: spot, velocity: make });
    expect(s.last(alice, 'challenge_result').error).toMatch(/already played|not your shot/);
    expect(s.game(alice).turn.shooter).toBe('bob');
  });
  it('expires stalled games on the timer, drops legacy ten-shot rows at startup, and keeps working when storage fails', async () => {
    const repository = memory();
    repository.rows.set('ch_old', { id: 'ch_old', revision: 3, seed: 'x', status: 'pending', createdAt: 1, updatedAt: 2, expiresAt: 3,
      challenger: { ownerId: 'alice', name: 'Alice', made: [true] }, challengee: { ownerId: 'bob', name: 'Bob', made: [] }, seenBy: [] });
    const s = setup(repository); await s.manager.initialize();
    expect(repository.rows.has('ch_old')).toBe(false);
    const alice = s.socket('alice');
    expect(s.game(alice)).toBeUndefined();
    s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    const id = s.last(alice, 'challenge_result').id as string;
    await s.manager.flush(); const saves = repository.saves;
    s.manager.tick(); await s.manager.flush(); expect(repository.saves).toBe(saves);
    s.advance(8 * 24 * 3600 * 1000); s.manager.tick(); await s.manager.flush();
    expect(s.game(alice).status).toBe('expired');
    repository.saveChallenges = async () => { throw new Error('offline'); };
    s.advance(1000); s.manager.receive(alice, { type: 'challenge', action: 'create', challengeeId: 'bob' });
    expect(s.last(alice, 'challenge_result').success).toBe(true);
    await s.manager.flush(); expect(s.manager.persistenceHealthy).toBe(false);
    repository.saveChallenges = memory().saveChallenges.bind(repository);
    s.advance(31 * 24 * 3600 * 1000); s.manager.tick(); await s.manager.flush();
    expect(repository.rows.has(id)).toBe(false);
  });
});
