/** Local-only audit server. Never starts the real auth, hooks, or persistence services. */
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [build, fixture, output, portText = '5184'] = process.argv.slice(2);
if (!build || !fixture || !output) throw new Error('Usage: node --import tsx scripts/performance/serve.ts BUILD FIXTURE OUTPUT [PORT]');
const root = resolve(build);
const results = resolve(output);
const port = Number(portText);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535');
const world = JSON.parse(await readFile(resolve(fixture), 'utf8'));
await mkdir(results, { recursive: true });
const app = Fastify();
await app.register(websocket);
const snapshot = () => ({ ...world, serverTime: Date.now() });
app.get('/api/auth/session', async (_, reply) => reply.code(401).send({ authenticated: false }));
app.get('/api/state', async () => snapshot());
app.get('/api/team', async () => ({ members: [], total: 0 }));
app.get('/api/*', async () => ({}));
app.get('/ws', { websocket: true }, socket => {
  const send = () => socket.send(JSON.stringify({ type: 'world_snapshot', buildId: 'fixed-benchmark', snapshot: snapshot() }));
  socket.send(JSON.stringify({ type: 'auth_result', success: false }));
  send();
  socket.on('message', raw => {
    try { if (JSON.parse(raw.toString()).type === 'request_state') send(); } catch { /* Ignore malformed audit messages. */ }
  });
});
app.get('/benchmark.js', async (_, reply) => reply.type('text/javascript').send(await readFile(fileURLToPath(new URL('./frames.js', import.meta.url)))));
app.post('/benchmark-result', async (request) => {
  const data = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  await appendFile(resolve(results, `frames-${port}.jsonl`), JSON.stringify(data) + '\n');
  return { ok: true };
});
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
app.get('/*', async (request, reply) => {
  const url = new URL(request.url, 'http://localhost');
  let name: string;
  try { name = decodeURIComponent(url.pathname); } catch { return reply.code(400).send(); }
  const file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + sep)) return reply.code(404).send();
  let data: Buffer;
  try { data = await readFile(file); } catch { return reply.code(404).send(); }
  if (extname(file) === '.html' && url.searchParams.has('benchmark')) {
    data = Buffer.from(data.toString().replace('</body>', '<script src="/benchmark.js"></script></body>'));
  }
  return reply.header('Cache-Control', 'no-store').type(types[extname(file)] ?? 'application/octet-stream').send(data);
});
await app.listen({ host: '127.0.0.1', port });
console.log(`Audit build: http://127.0.0.1:${port}/?factoryServer=local&skyTime=day&skyWeather=cloudy&benchmark=1`);
