import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../server/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';

const credential = `Bearer afd1_${'Q'.repeat(43)}`;
const apps: ReturnType<typeof Fastify>[] = [];
async function fixture() {
  const app = Fastify(); apps.push(app); await app.register(cookie);
  const state = new StateManager('factory25d'), auth = new AuthService('vortex-test-only');
  registerHookRoutes(app, state, new BroadcastManager(), { title: 'QA' }, auth,
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }), new RemoteSessionRegistry());
  const principal = auth.authenticateDevice(credential);
  if (principal.kind !== 'authenticated') throw new Error('fixture');
  const session = auth.issueBrowserSession({ ownerId: principal.ownerId, username: 'QA' });
  return { app, state, session };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each([undefined, 'Bearer invalid', 'Basic abc'])('rejects unauthenticated vortex calls: %s', async authorization => {
  const { app, state } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', headers: authorization ? { authorization } : {} });
  expect(response.statusCode).toBe(401); expect(state.getSnapshot().events).toEqual([]);
});
it('accepts an authenticated CLI request without a browser origin', async () => {
  const { app, state } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', headers: { authorization: credential } });
  expect(response.statusCode).toBe(200); expect(response.json().ok).toBe(true);
  expect(state.getSnapshot().events).toHaveLength(1);
});
it('accepts a signed browser session only from its host', async () => {
  const { app, session } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', cookies: { af_session: session }, headers: { host: 'factory.test', origin: 'https://factory.test' } });
  expect(response.statusCode).toBe(200);
});
it.each([undefined, 'null', 'https://evil.test', 'https://user@factory.test', 'https://factory.test/path', 'ftp://factory.test', 'https://factory.test?x=1', 'https://factory.test#fragment'])('rejects missing or forged browser origins: %s', async origin => {
  const { app, session, state } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', cookies: { af_session: session }, headers: { host: 'factory.test', ...(origin ? { origin } : {}) } });
  expect(response.statusCode).toBe(403); expect(state.getSnapshot().events).toEqual([]);
});
it('does not fall back to the cookie when a supplied credential is invalid', async () => {
  const { app, session } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', cookies: { af_session: session }, headers: { authorization: 'Bearer invalid', host: 'factory.test', origin: 'https://factory.test' } });
  expect(response.statusCode).toBe(401);
});
it('rejects a cross-origin browser even with a device credential', async () => {
  const { app } = await fixture();
  const response = await app.inject({ method: 'POST', url: '/api/vortex', headers: { authorization: credential, host: 'factory.test', origin: 'https://evil.test' } });
  expect(response.statusCode).toBe(403);
});
it('requires secure transport for remote production requests', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const { app } = await fixture();
  const request = { method: 'POST' as const, url: '/api/vortex', remoteAddress: '203.0.113.10', headers: { authorization: credential } };
  expect((await app.inject(request)).statusCode).toBe(400);
  expect((await app.inject({ ...request, headers: { ...request.headers, 'x-forwarded-proto': 'https' } })).statusCode).toBe(200);
});
it('serializes simultaneous owners and allows another vortex after the active effect expires', async () => {
  const { app, state } = await fixture();
  const requests = [credential, `Bearer afd1_${'R'.repeat(43)}`].map(authorization => app.inject({ method: 'POST', url: '/api/vortex', headers: { authorization } }));
  const responses = await Promise.all(requests);
  expect(responses.map(response => response.statusCode).sort()).toEqual([200, 429]);
  expect(Number(responses.find(response => response.statusCode === 429)!.headers['retry-after'])).toBeGreaterThan(0);
  expect(state.getSnapshot().events).toHaveLength(1);
  vi.spyOn(Date, 'now').mockReturnValue(state.getSnapshot().events[0].expiresAt + 1);
  expect((await app.inject({ method: 'POST', url: '/api/vortex', headers: { authorization: credential } })).statusCode).toBe(200);
});
