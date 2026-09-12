import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { expect, it } from 'vitest';
import { AuthService } from '../server/auth.js';
import { AuthHandoffManager } from '../server/auth-handoff.js';
import { registerAuthRoutes } from '../server/routes/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';

const headers = { authorization: `Bearer afd1_${'Q'.repeat(43)}` };
async function fixture() {
  const app = Fastify(); await app.register(cookie);
  const state = new StateManager('factory25d'), auth = new AuthService('test-only');
  registerHookRoutes(app, state, new BroadcastManager(), { title: 'QA' }, auth,
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }), new RemoteSessionRegistry());
  registerAuthRoutes(app, auth, new AuthHandoffManager());
  return { app, state };
}

it.each([
  { username: {}, message: 'hello' }, { username: 'QA', message: {} },
  { username: 'QA', message: ['hello'] }, { username: 'QA', message: 1 },
])('rejects malformed chat instead of storing an invalid world: %j', async payload => {
  const { app, state } = await fixture();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/chat', payload, headers });
    expect(response.statusCode).toBe(400); expect(state.getSnapshot().chat).toEqual([]);
  } finally { await app.close(); }
});

it.each([42, {}, ['QA']])('rejects a non-string handoff username without a server error: %j', async username => {
  const { app } = await fixture();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/auth/handoff', payload: { username }, headers });
    expect(response.statusCode).toBe(400);
  } finally { await app.close(); }
});

it('rejects an array-shaped handoff code without hashing it as a string', async () => {
  const { app } = await fixture();
  try {
    const response = await app.inject({ method: 'POST', url: '/api/auth/handoff/exchange', payload: { code: ['Q'.repeat(43)] } });
    expect(response.statusCode).toBe(400);
  } finally { await app.close(); }
});

it.each([42, {}, ['summary']])('rejects a malformed context summary without changing the agent: %j', async summary => {
  const { app, state } = await fixture();
  try {
    await app.inject({ method: 'POST', url: '/api/hooks', headers,
      payload: { hook_event_name: 'SessionStart', session_id: 'qa-context', username: 'QA', cwd: '/qa' } });
    const before = state.getSnapshot().revision;
    const response = await app.inject({ method: 'POST', url: '/api/context', payload: { summary }, headers });
    expect(response.statusCode).toBe(400); expect(state.getSnapshot().revision).toBe(before);
  } finally { await app.close(); }
});
