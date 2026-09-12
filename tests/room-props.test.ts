import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { RoomPropsManager } from '../server/room-props';
import { StateManager } from '../server/state';
import { BroadcastManager } from '../server/ws/broadcast';
import { DEFAULT_AVATAR } from '../shared/constants';
import { toFactoryWorld } from '../shared/factory25d-layout';
import { FALLING_ROOM_LIGHTS, ROOM_LIGHT_IDS, snackWorldPoint, validRoomPropRequest, type PropVector, type RoomPropsState } from '../shared/room-props';

function socket() {
  const messages: any[] = [];
  return { socket: { readyState: 1, on() {}, send(raw: string) { messages.push(JSON.parse(raw)); } } as unknown as WebSocket, messages };
}
function setup() {
  let now = 1000, serial = 0;
  const state = new StateManager('factory25d', () => now), broadcast = new BroadcastManager();
  const manager = new RoomPropsManager(state, broadcast, () => now);
  const a = socket(), b = socket(); broadcast.add(a.socket); broadcast.add(b.socket);
  const step = (ms: number) => { for (let i = 0; i < ms; i += 50) { now += 50; manager.tick(); } };
  const send = (action: Record<string, unknown>, peer = a) => manager.receive(peer.socket, { type: 'room_prop', requestId: `r-${serial++}`, ...action });
  const latest = (peer = b): RoomPropsState => peer.messages.filter(m => m.type === 'room_props_state').at(-1);
  return { state, manager, a, b, step, send, latest, now: () => now };
}

describe('shared room props', () => {
  it.each(ROOM_LIGHT_IDS)('shares %s and sends its current value to late joiners', id => {
    const f = setup(); f.send({ action: 'light', id, on: false });
    expect(f.latest(f.a)).toEqual(f.latest(f.b));
    expect(f.latest().lights.find(light => light.id === id)?.on).toBe(false);
    const late = socket(); f.manager.sendActive(late.socket);
    expect(late.messages[0].lights).toEqual(f.latest().lights);
    f.send({ action: 'light', id, on: true }, f.b); f.step(100);
    expect(f.latest().lights.find(light => light.id === id)?.on).toBe(true);
  });
  it.each(Object.keys(FALLING_ROOM_LIGHTS))('shares the fall, cleanup route and recovery of %s even after the clicker disconnects', id => {
    const f = setup();
    for (let i = 0; i < 4; i++) { f.send({ action: 'light', id, on: i % 2 === 0 }); f.step(100); }
    const fallen = f.latest().lights.find(light => light.id === id)!;
    expect(fallen.fallenAt).not.toBeNull();
    f.manager.disconnect(f.a.socket); f.step(1000);
    const late = socket(); f.manager.sendActive(late.socket);
    expect(late.messages[0].lights.find((light: any) => light.id === id).fallenAt).toBe(fallen.fallenAt);
    const phases = new Set<string>(); let recovered = false;
    for (let i = 0; i < 1200; i++) {
      f.step(50); phases.add(f.manager.cleanup.phase);
      recovered ||= f.manager.snapshot().lights.find(light => light.id === id)!.recoverAt !== null;
    }
    expect(phases.has('cleaning')).toBe(true); expect(recovered).toBe(true);
    expect(f.manager.snapshot().lights.find(light => light.id === id)!.fallenAt).toBeNull();
    expect(f.manager.cleanup.phase).toBe('idle');
    expect(f.latest(f.a)).toEqual(f.latest(f.b));
  });
  it('keeps one rigid-body pile for concurrent dispenses, duplicate delivery and late joins', () => {
    const f = setup(), request = { type: 'room_prop', requestId: 'retry', action: 'dispense' };
    f.manager.receive(f.a.socket, request); f.manager.receive(f.a.socket, request);
    f.send({ action: 'dispense' }, f.b); f.step(8000);
    expect(f.manager.pile.bodies).toHaveLength(2); expect(f.manager.snapshot().dispenses).toBe(2);
    expect(f.latest(f.a).bodies).toEqual(f.latest(f.b).bodies);
    const late = socket(); f.manager.sendActive(late.socket);
    expect(late.messages[0].bodies).toEqual(f.manager.snapshot().bodies);
    expect(f.manager.pile.bodies.every(body => body.sleeping)).toBe(true);
  });
  it('queues multiple fallen fixtures and restores all of them', () => {
    const f = setup();
    for (const id of Object.keys(FALLING_ROOM_LIGHTS)) {
      for (let i = 0; i < 4; i++) { f.send({ action: 'light', id, on: false }); f.step(150); }
    }
    f.step(60_000);
    expect(f.manager.snapshot().lights.every(light => light.fallenAt === null)).toBe(true);
    expect(f.manager.cleanup.phase).toBe('idle');
  });
  it('rejects forged state, invalid IDs, non-booleans and unbounded requests', () => {
    const f = setup();
    for (const action of [
      { action: 'light', id: '__proto__', on: false }, { action: 'light', id: 'front-desk-lamp', on: 'false' },
      { action: 'pickup', sessionId: 'someone', id: 0 }, { action: 'restore', id: 'front-desk-lamp' },
      { action: 'state', bodies: [{ id: 42, position: [NaN, Infinity, 0] }] },
    ]) f.send(action);
    expect(f.a.messages).toHaveLength(0); expect(f.manager.snapshot().dispenses).toBe(0);
    expect(validRoomPropRequest({ type: 'room_prop', requestId: 'x'.repeat(65), action: 'dispense' })).toBe(false);
    for (let i = 0; i < 1000; i++) f.send({ action: 'dispense' });
    expect(f.manager.snapshot().dispenses).toBe(8); expect(f.a.messages.length).toBeLessThan(12);
    for (let i = 0; i < 100; i++) { f.step(150); f.send({ action: 'dispense' }); }
    const snapshot = f.manager.snapshot(); expect(snapshot.bodies.length + snapshot.queued + snapshot.held.length).toBeLessThanOrEqual(48);
  });
  it('does not count request retries as extra lamp taps', () => {
    const f = setup(), request = { type: 'room_prop', requestId: 'retry', action: 'light', id: 'front-desk-lamp', on: false };
    for (let i = 0; i < 6; i++) { f.manager.receive(f.a.socket, request); f.step(100); }
    expect(f.manager.lights.get('front-desk-lamp')?.presses).toBe(1);
    expect(f.manager.lights.get('front-desk-lamp')?.fallenAt).toBeNull();
  });
  it('transfers a floor item once, shares the carrier through room changes, then eats it with a cooldown', () => {
    const f = setup(); f.send({ action: 'dispense' }); f.step(8000);
    const body = f.manager.pile.bodies[0], point = snackWorldPoint(body.position.toArray() as PropVector);
    for (const id of ['a', 'b']) {
      f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: id, username: id, cwd: '/synthetic-qa', avatar: DEFAULT_AVATAR });
      const agent = f.state.get(id)!; agent.activity = 'idle';
      agent.world = { zone: 'idle', facing: 'down', position: toFactoryWorld(point) };
    }
    f.step(100);
    expect(f.manager.pile.bodies).toHaveLength(0);
    expect(f.latest().held).toHaveLength(1); expect(f.latest(f.a).held).toEqual(f.latest(f.b).held);
    const item = f.latest().held[0]; expect(item.id).toBe(body.id);
    const late = socket(); f.manager.sendActive(late.socket); expect(late.messages[0].held).toEqual(f.latest().held);
    const carrier = f.state.get(item.sessionId)!;
    carrier.world.position = toFactoryWorld({ x: 15, z: 3 }); f.step(500);
    expect(f.manager.snapshot().held[0]).toEqual(item);
    f.step(22_000); expect(f.manager.snapshot().held).toHaveLength(0);
    expect(f.latest().held).toHaveLength(0);
  });
  it('does not pick through the cabinet or while working, grabbed or driving; clears a carrier on departure', () => {
    const f = setup(); f.send({ action: 'dispense' }); f.step(8000);
    const point = snackWorldPoint(f.manager.pile.bodies[0].position.toArray() as PropVector);
    f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'a', username: 'a', cwd: '/synthetic-qa', avatar: DEFAULT_AVATAR });
    const agent = f.state.get('a')!;
    agent.world = { zone: 'idle', facing: 'down', position: toFactoryWorld(point) };
    agent.activity = 'writing'; f.step(100); expect(f.manager.snapshot().held).toHaveLength(0);
    agent.activity = 'idle'; f.state.setGrabbedSessionCheck(() => true); f.step(100);
    expect(f.manager.snapshot().held).toHaveLength(0);
    f.state.setGrabbedSessionCheck(() => false);
    agent.world.position = toFactoryWorld(snackWorldPoint([0, 0, .3])); f.step(100);
    expect(f.manager.snapshot().held).toHaveLength(0);
    agent.world.position = toFactoryWorld(point); f.step(100); expect(f.manager.snapshot().held).toHaveLength(1);
    agent.activity = 'stopped'; f.step(100); expect(f.manager.snapshot().held).toHaveLength(0);
  });
});
