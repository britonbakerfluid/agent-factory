import type { FastifyInstance, FastifyRequest } from 'fastify';
import { youtubeVideoId } from '../shared/lounge-radio.js';

/** Extract a balanced JSON object, respecting braces and delimiters inside strings. */
export function youtubeInitialData(html: string): unknown {
  const start = /(?:var\s+)?ytInitialData\s*=\s*\{/.exec(html);
  if (!start) throw new Error('Missing search data');
  const offset = start.index + start[0].lastIndexOf('{');
  let depth = 0, quoted = false, escaped = false;
  for (let i = offset; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(offset, i + 1));
  }
  throw new Error('Incomplete search data');
}
async function boundedText(response: Response) {
  if (!response.ok || !response.body) throw new Error('Search unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 2_000_000) throw new Error('Search response too large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}
export function registerRadioSearch(app: FastifyInstance, owner: (request: FastifyRequest) => string | undefined) {
  const cache = new Map<string, { at: number; results?: unknown[] }>();
  const requests = new Map<string, number>();
  app.get('/api/radio/search', async (request, reply) => {
    const principal = owner(request);
    if (!principal) return reply.code(401).send({ error: 'Connect your browser to search music.' });
    const now = Date.now();
    for (const [key, at] of requests) if (now - at > 60_000) requests.delete(key);
    const keys = [`owner:${principal}`, `ip:${request.ip}`];
    if (keys.some(key => now - (requests.get(key) ?? -Infinity) < 1000)) return reply.code(429).send({ error: 'Wait a moment before searching again.' });
    keys.forEach(key => requests.set(key, now));
    const query = (request.query as { q?: unknown }).q;
    if (typeof query !== 'string' || !query.trim() || query.length > 200) return reply.code(400).send({ error: 'Enter a search or YouTube link (up to 200 characters).' });
    const q = query.trim(), hit = cache.get(q);
    const unavailable = () => reply.code(502).send({ error: 'YouTube search is unavailable. Try again or paste a video link.' });
    if (hit && now - hit.at < (hit.results ? 60_000 : 10_000)) return hit.results ? { results: hit.results } : unavailable();
    try {
      const id = youtubeVideoId(q), results: unknown[] = [];
      const url = id ? `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`;
      const text = await boundedText(await fetch(url, { signal: AbortSignal.timeout(7000), redirect: 'error' }));
      if (id) {
        const data = JSON.parse(text);
        if (typeof data.title !== 'string') throw new Error('Invalid metadata');
        results.push({ videoId: id, title: data.title.slice(0, 200), channel: String(data.author_name ?? '').slice(0, 120) });
      } else {
        const queue: unknown[] = [youtubeInitialData(text)], seen = new Set<string>();
        for (let visited = 0; queue.length && results.length < 10 && visited < 20_000; visited++) {
          const value = queue.pop(); if (!value || typeof value !== 'object') continue;
          const node = value as Record<string, any>, video = node.videoRenderer;
          if (video && typeof video.videoId === 'string' && youtubeVideoId(video.videoId) && !seen.has(video.videoId)) {
            seen.add(video.videoId);
            results.push({ videoId: video.videoId, title: String(video.title?.runs?.map((run: { text?: string }) => run.text ?? '').join('') ?? 'YouTube video').slice(0, 200),
              channel: String(video.ownerText?.runs?.[0]?.text ?? '').slice(0, 120), duration: String(video.lengthText?.simpleText ?? '').slice(0, 20) });
          }
          queue.push(...Object.values(node));
        }
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(q, { at: now, results }); return { results };
    } catch {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(q, { at: now }); return unavailable();
    }
  });
}
