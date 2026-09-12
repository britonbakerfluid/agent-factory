import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast';
import { LoungeRadio } from '../server/lounge-radio';
import type { RadioRequest } from '../shared/lounge-radio';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('authenticates removal, permits collaborative edits, and rejects stale revisions', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ title: 'Song' }) })));
  const broadcast = new BroadcastManager(), radio = new LoungeRadio(broadcast);
  const socket = (ownerId?: string) => {
    const s = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() });
    broadcast.add(s as unknown as WebSocket);
    if (ownerId) broadcast.authenticateSocket(s as unknown as WebSocket, { ownerId, username: ownerId });
    return s;
  };
  const alice = socket('alice'), bob = socket('bob'), guest = socket();
  const send = (s: ReturnType<typeof socket>, message: Parameters<LoungeRadio['receive']>[1]) => radio.receive(s as unknown as WebSocket, message);
  const last = (s: ReturnType<typeof socket>, type: string) => s.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter(m => m.type === type).at(-1);
  await send(alice, { type: 'radio_queue', action: 'add', videoId: 'jfKfPfyJRdk' });
  vi.advanceTimersByTime(501);
  await send(alice, { type: 'radio_queue', action: 'add', videoId: '5qap5aO4i9A' });
  const state = last(alice, 'radio_state');
  const request = { type: 'radio_queue' as const, action: 'remove' as const, entryId: state.queue[0].id, revision: state.revision };
  await send(guest, request);
  expect(last(guest, 'radio_result').success).toBe(false);
  await send(bob, request);
  expect(last(bob, 'radio_result').success).toBe(true);
  expect(last(alice, 'radio_state').queue).toHaveLength(0);
  vi.advanceTimersByTime(501);
  await send(bob, request);
  expect(last(bob, 'radio_result').success).toBe(false);
});

it('broadcasts bounded scratch gestures to listeners, rejects guests and stale tracks, and limits competing DJs', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  const broadcast = new BroadcastManager(), radio = new LoungeRadio(broadcast);
  const socket = (ownerId?: string) => {
    const s = Object.assign(new EventEmitter(), {readyState: 1, send: vi.fn()});
    broadcast.add(s as unknown as WebSocket);
    if (ownerId) broadcast.authenticateSocket(s as unknown as WebSocket, {ownerId, username: ownerId});
    return s;
  };
  const alice = socket('alice'), bob = socket('bob'), guest = socket();
  radio.sendActive(alice as unknown as WebSocket);
  const messages = (s: typeof alice, type: string) => s.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter(m => m.type === type);
  const entryId = messages(alice, 'radio_state').at(-1).current.id;
  const gesture = {type: 'radio_queue' as const, action: 'scratch' as const, entryId, deck: 0, offset: -.5};
  const send = (s: typeof alice, message = gesture) => radio.receive(s as unknown as WebSocket, message);
  await send(guest); expect(messages(bob, 'radio_scratch')).toHaveLength(0);
  await send(alice, {...gesture, offset: 5});
  await send(alice, {...gesture, entryId: -1});
  expect(messages(bob, 'radio_scratch')).toHaveLength(0);
  await send(alice);
  expect(messages(bob, 'radio_scratch')).toHaveLength(1);
  expect(messages(guest, 'radio_scratch')[0]).toMatchObject({entryId, offset: -.5, deck: 0});
  await send(alice); await send(bob); expect(messages(guest, 'radio_scratch')).toHaveLength(1);
  vi.advanceTimersByTime(400); await send(bob);
  expect(messages(alice, 'radio_scratch')).toHaveLength(2);
});

it.each(['scratch', 'skip', 'duration', 'reorder', 'remove', 'add'] as const)('publishes a track boundary before rejecting a stale or invalid %s request', async action => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000);
  const broadcast = new BroadcastManager(), radio = new LoungeRadio(broadcast);
  const socket = (ownerId?: string) => {
    const s = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() });
    broadcast.add(s as unknown as WebSocket);
    if (ownerId) broadcast.authenticateSocket(s as unknown as WebSocket, { ownerId, username: ownerId });
    return s;
  };
  const alice = socket('alice'), listener = socket();
  const messages = (s: typeof alice, type: string) => s.send.mock.calls.map(([raw]) => JSON.parse(raw)).filter(m => m.type === type);
  radio.sendActive(alice as unknown as WebSocket);
  const original = messages(alice, 'radio_state').at(-1);
  alice.send.mockClear(); listener.send.mockClear();
  vi.setSystemTime(original.current.startedAt + original.current.duration * 1000 + 1);
  const entryId = original.current.id, revision = original.revision;
  const request: RadioRequest = action === 'scratch' ? { type: 'radio_queue', action, entryId, deck: 0, offset: .5 }
    : action === 'duration' ? { type: 'radio_queue', action, entryId, seconds: 600 }
    : action === 'reorder' ? { type: 'radio_queue', action, ids: [], revision }
    : action === 'remove' ? { type: 'radio_queue', action, entryId, revision }
    : action === 'add' ? { type: 'radio_queue', action, videoId: 'invalid' }
    : { type: 'radio_queue', action, entryId };
  await radio.receive(alice as unknown as WebSocket, request);
  radio.tick(); vi.advanceTimersByTime(1000); radio.tick();
  expect(messages(listener, 'radio_state')).toHaveLength(1);
  expect(messages(alice, 'radio_state')).toEqual(messages(listener, 'radio_state'));
  expect(messages(listener, 'radio_state')[0]).toMatchObject({ revision: revision + 1, current: { id: entryId + 1 } });
  expect(messages(listener, 'radio_scratch')).toHaveLength(0);
  if (action !== 'scratch') expect(messages(alice, 'radio_result').at(-1).success).toBe(false);
});
