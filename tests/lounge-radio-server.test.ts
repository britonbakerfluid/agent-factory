import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast';
import { LoungeRadio } from '../server/lounge-radio';

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
