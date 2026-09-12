import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../server/auth.js';
import { AuthHandoffManager } from '../server/auth-handoff.js';
import { registerAuthRoutes } from '../server/routes/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import { parseWorldSnapshot } from '../server/persistence/world-repository.js';
import { STOPPED_REMOVAL_DELAY_MS } from '../shared/constants.js';

const authorization = `Bearer afd1_${'S'.repeat(43)}`;
const other = `Bearer afd1_${'T'.repeat(43)}`;
const apps: ReturnType<typeof Fastify>[] = [];
async function fixture() {
  const app = Fastify(); apps.push(app); await app.register(cookie);
  const state = new StateManager('arcade'), auth = new AuthService('qa-security-fixture-only');
  const registry = new RemoteSessionRegistry();
  registry.setAdmissionCheck((id, ownerId) => state.get(id)?.ownerId === ownerId);
  registerHookRoutes(app, state, new BroadcastManager(), { title: 'QA' }, auth,
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }), registry);
  registerAuthRoutes(app, auth, new AuthHandoffManager());
  await app.ready();
  const post = (url: string, payload: unknown, credential = authorization) => app.inject({ method: 'POST', url,
    headers: { authorization: credential, 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  const hook = (event: string, fields: Record<string, unknown> = {}, credential = authorization) => post('/api/hooks',
    { session_id: 'qa-owned', hook_event_name: event, username: 'QA', cwd: '/qa-fixture', ...fields }, credential);
  return { app, state, auth, registry, post, hook };
}
beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(async () => { vi.clearAllTimers(); vi.useRealTimers(); await Promise.all(apps.splice(0).map(app => app.close())); vi.restoreAllMocks(); });

it('keeps ownership under adversarial child and lifecycle updates', async () => {
  const { state, hook } = await fixture(); await hook('SessionStart');
  for (const event of ['SessionStart', 'SessionEnd', 'SubagentStart', 'SubagentStop', 'PreToolUse', 'Stop']) {
    const before = state.getSnapshot();
    const response = await hook(event, { agent_id: 'qa-child', ownerId: 'forged' }, other);
    expect(response.statusCode).toBe(403);
    expect(state.getSnapshot().agents).toEqual(before.agents);
    expect(state.getSnapshot().revision).toBe(before.revision);
  }
});

it('survives prototype-like IDs and malformed nested hook values across persistence', async () => {
  const { state, hook } = await fixture();
  for (const session_id of ['__proto__', 'constructor', 'toString']) {
    expect((await hook('SessionStart', { session_id, avatar: { spriteIndex: -1, color: { bad: true }, hat: [], arbitrary: 'must-not-survive' } })).statusCode).toBe(200);
    expect((await hook('PreToolUse', { session_id, tool_name: '__proto__', tool_input: { command: { toString: null } } })).statusCode).toBe(200);
  }
  const restored = new StateManager('arcade');
  expect(() => restored.restoreWorld(parseWorldSnapshot(JSON.stringify(state.getSnapshot())))).not.toThrow();
  expect(restored.getSnapshot().agents).toHaveLength(3);
  expect(JSON.stringify(restored.getSnapshot())).not.toContain('must-not-survive');
  expect(({} as Record<string, unknown>).bad).toBeUndefined();
});

it('retains the global vortex cooldown through snapshot restoration and a request burst', async () => {
  const first = await fixture();
  expect((await first.post('/api/vortex', {})).statusCode).toBe(200);
  const restarted = await fixture();
  restarted.state.restoreWorld(parseWorldSnapshot(JSON.stringify(first.state.getSnapshot())));
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => restarted.post('/api/vortex', {}, i % 2 ? authorization : other)));
  expect(results.every(response => response.statusCode === 429)).toBe(true);
  expect(restarted.state.getSnapshot().events).toHaveLength(1);
});

it('does not turn malformed top-level HTTP payloads into 500 responses', async () => {
  const { post } = await fixture();
  for (const url of ['/api/hooks', '/api/chat', '/api/context', '/api/emote', '/api/registry/heartbeat', '/api/auth/handoff', '/api/auth/handoff/exchange']) {
    for (const payload of [null, [], 1, 'text', true, { toString: null, valueOf: null }]) {
      expect((await post(url, payload)).statusCode, `${url}: ${JSON.stringify(payload)}`).toBeLessThan(500);
    }
  }
});

it('validates or safely ignores a non-string heartbeat display name before logging it', async () => {
  const { post, hook, registry } = await fixture(); await hook('SessionStart');
  const response = await post('/api/registry/heartbeat', { session_ids: ['qa-owned'], username: { toString: null, valueOf: null } });
  expect(response.statusCode).toBe(400);
  expect(registry.size).toBe(0);
});

it('does not remove a resumed session after duplicate SessionEnd deliveries', async () => {
  const { state, hook } = await fixture();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  await hook('SessionStart'); await hook('SessionEnd');
  vi.advanceTimersByTime(100);
  await hook('SessionEnd');
  vi.advanceTimersByTime(100);
  await hook('UserPromptSubmit');
  expect(state.get('qa-owned')?.activity).toBe('thinking');
  vi.advanceTimersByTime(STOPPED_REMOVAL_DELAY_MS);
  expect(state.get('qa-owned')?.activity).toBe('thinking');
});

it('keeps a single child for duplicate SubagentStart delivery', async () => {
  const { state, hook } = await fixture(); await hook('SessionStart');
  for (let i = 0; i < 30; i++) await hook('SubagentStart', { agent_id: 'stable-child-id', agent_type: 'QA' });
  await hook('PreToolUse', { agent_id: 'stable-child-id', tool_name: 'Read' });
  expect(state.get('qa-owned')?.subagents).toHaveLength(1);
  expect(state.get('qa-owned')?.subagents[0].activity).toBe('reading');
});

it('keeps distinct legacy children started without IDs in the same millisecond', async () => {
  const { state, hook } = await fixture(); await hook('SessionStart');
  vi.spyOn(Date, 'now').mockReturnValue(123456);
  await hook('SubagentStart'); await hook('SubagentStart');
  const children = state.get('qa-owned')!.subagents;
  expect(children).toHaveLength(2);
  expect(new Set(children.map(child => child.agentId)).size).toBe(2);
});
