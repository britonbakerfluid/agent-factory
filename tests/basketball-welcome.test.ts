import { welcomeChallengeOwner } from '../server/welcome-challenge-config';
import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BasketballChallengeBook, HORSE_WELCOME_SPOT, HORSE_RESULT_TTL_MS, HORSE_INVITE_TTL_MS, simulateChallengeShot, validHorseSpot } from '../shared/basketball-challenge';
import { BasketballChallenges, type ChallengeRepository } from '../server/basketball-challenges';
import { BroadcastManager } from '../server/ws/broadcast';
import { visitorShotVelocity } from '../shared/visitor-basketball';

const briton = { ownerId: 'briton-id', name: 'Briton' }, alice = { ownerId: 'alice', name: 'Alice' }, bob = { ownerId: 'bob', name: 'Bob' };
const people = [briton, alice, bob];
function harness(owner: string | undefined = briton.ownerId) {
  const rows = new Map<string, unknown>();
  const repository: ChallengeRepository = {
    loadChallenges: async () => [...rows.values()],
    saveChallenges: async games => { games.forEach(game => rows.set(game.id, structuredClone(game))); },
    deleteChallenges: async ids => { ids.forEach(id => rows.delete(id)); },
  };
  const broadcast = new BroadcastManager();
  const manager = new BasketballChallenges(repository, broadcast, id => people.find(p => p.ownerId === id), () => 1000, owner);
  function socket(id?: string) {
    const socket = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() }) as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
    broadcast.add(socket); if (id) broadcast.authenticateSocket(socket, { ownerId: id, username: people.find(p => p.ownerId === id)?.name ?? 'Unknown' });
    return socket;
  }
  const games = (socket: WebSocket & { send: ReturnType<typeof vi.fn> }) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter(m => m.type === 'challenge_state').at(-1)?.challenges ?? [];
  return { manager, repository, broadcast, socket, games, rows };
}

describe('Briton welcome shot', () => {
  it('is a real made shot from the clear middle aisle, with separate matching turns', () => {
    expect(validHorseSpot(HORSE_WELCOME_SPOT)).toBe(true);
    expect(simulateChallengeShot(HORSE_WELCOME_SPOT, visitorShotVelocity(HORSE_WELCOME_SPOT))).toBe(true);
    const book = new BasketballChallengeBook();
    const a = book.welcome(briton, alice, 1000)!, b = book.welcome(briton, bob, 1000)!;
    expect(a).not.toBe(b);
    expect(book.get(a)).toMatchObject({ welcome: true, status: 'pending', challenger: briton, turn: { shooter: alice.ownerId, role: 'match' }, lastShot: { shooter: briton.ownerId, made: true, release: { position: HORSE_WELCOME_SPOT } } });
    book.respond(a, alice.ownerId, true, 1100);
    const before = book.get(b);
    book.shot(a, alice.ownerId, book.get(a)!.revision, HORSE_WELCOME_SPOT, visitorShotVelocity(HORSE_WELCOME_SPOT), 1200);
    expect(book.get(b)).toEqual(before);
  });
  it('keeps a durable receipt after decline or expiry so reconnects never recreate the invite', () => {
    const book = new BasketballChallengeBook();
    const id = book.welcome(briton, alice, 1000)!;
    book.respond(id, alice.ownerId, false, 1100);
    const later = 2000 + HORSE_RESULT_TTL_MS + HORSE_INVITE_TTL_MS;
    book.expire(later); book.prune(later);
    const restored = new BasketballChallengeBook(book.list());
    expect(restored.welcome(briton, alice, later)).toBeUndefined();
    expect(restored.get(id)?.status).toBe('declined');
    expect(book.welcome(briton, briton, later)).toBeUndefined();
    expect(book.welcome(briton, { ownerId: 'legacy:someone', name: 'Someone' }, later)).toBeUndefined();
  });
  it('supports the whole team without consuming normal outgoing invite slots or replacing games', () => {
    const book = new BasketballChallengeBook();
    for (let i = 0; i < 20; i++) expect(book.welcome(briton, { ownerId: `member${i}`, name: `Member ${i}` }, 1000)).toBeTruthy();
    const existing = book.create(briton, alice, 1000);
    expect(existing.success).toBe(true);
    expect(book.welcome(briton, alice, 1100)).toBeUndefined();
    expect(book.get(existing.id!)?.welcome).toBeUndefined();
  });
  it('delivers only after persistence, only to participants, and restores the same invite', async () => {
    const h = harness(); await h.manager.initialize();
    let release!: () => void;
    const save = h.repository.saveChallenges;
    h.repository.saveChallenges = async games => { await new Promise<void>(resolve => { release = resolve; }); await save(games); };
    const a = h.socket(alice.ownerId), anotherTab = h.socket(alice.ownerId), stranger = h.socket(bob.ownerId);
    h.manager.sendActive(a); await Promise.resolve();
    h.manager.sendActive(anotherTab);
    expect(h.games(a)).toHaveLength(0); expect(h.games(anotherTab)).toHaveLength(0);
    release(); await h.manager.flush();
    expect(h.games(a)).toHaveLength(1); expect(h.games(anotherTab)).toHaveLength(1); expect(h.games(stranger)).toHaveLength(0);
    const id = h.games(a)[0].id;
    const restored = new BasketballChallenges(h.repository, h.broadcast, id => people.find(p => p.ownerId === id), () => 2000, briton.ownerId);
    await restored.initialize(); restored.sendActive(a);
    expect(h.games(a)).toHaveLength(1); expect(h.games(a)[0].id).toBe(id);
  });
  it('fails quietly on storage failure, retries, and does not create games for anonymous sockets', async () => {
    const h = harness(); await h.manager.initialize();
    const save = h.repository.saveChallenges; h.repository.saveChallenges = async () => { throw new Error('offline'); };
    const guest = h.socket(), a = h.socket(alice.ownerId);
    h.manager.sendActive(guest); h.manager.sendActive(a); await h.manager.flush();
    expect(h.games(a)).toHaveLength(0); expect(h.games(guest)).toHaveLength(0);
    h.repository.saveChallenges = save; await h.manager.flush();
    expect(h.games(a)).toHaveLength(1); expect(h.rows.size).toBe(1);
  });
});

it('enables the welcome shot only on the authorized deployment, with an explicit opt-out', () => {
  expect(welcomeChallengeOwner({ RENDER_EXTERNAL_HOSTNAME: 'fluid-factory.onrender.com' })).toBe('FGApEbY5j36CGIdrEvuUZ1DoBn03cPKgnQmWvRnHqnQ');
  expect(welcomeChallengeOwner({ RENDER_EXTERNAL_HOSTNAME: 'someone-else.onrender.com' })).toBeUndefined();
  expect(welcomeChallengeOwner({})).toBeUndefined();
  expect(welcomeChallengeOwner({ RENDER_EXTERNAL_HOSTNAME: 'fluid-factory.onrender.com', AF_WELCOME_HORSE_OWNER_ID: '' })).toBeUndefined();
  expect(welcomeChallengeOwner({ AF_WELCOME_HORSE_OWNER_ID: 'custom-owner' })).toBe('custom-owner');
});
