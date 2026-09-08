import type { WebSocket } from '@fastify/websocket';
import type { BroadcastManager } from './ws/broadcast.js';
import { LoungeRadioQueue, youtubeVideoId, type RadioRequest } from '../shared/lounge-radio.js';

export class LoungeRadio {
  private queue = new LoungeRadioQueue();
  private lastRequest = new Map<string, number>();
  constructor(private broadcast: BroadcastManager) {}
  sendActive(socket: WebSocket) {
    const now = Date.now();
    if (this.queue.advance(now)) this.broadcast.broadcastRadio(this.queue.snapshot(now));
    this.broadcast.sendTo(socket, this.queue.snapshot(now));
  }
  async receive(socket: WebSocket, message: RadioRequest) {
    const silent = message.action === 'duration';
    const reply = (error: string) => this.broadcast.sendTo(socket, { type: 'radio_result', success: false, error, silent });
    const principal = this.broadcast.getSocketPrincipal(socket);
    if (!principal) { reply('Connect your browser to change the shared music queue.'); return; }
    const now = Date.now(), key = `${principal.ownerId}:${silent ? 'duration' : 'queue'}`;
    if (now - (this.lastRequest.get(key) ?? -Infinity) < (silent ? 1000 : 500)) { reply('Give the queue a moment, then try again.'); return; }
    this.lastRequest.set(key, now);
    this.queue.advance(now);
    let result;
    if (message.action === 'add') {
      const id = youtubeVideoId(message.videoId);
      if (!id) { reply('Paste a YouTube video link.'); return; }
      let title: string | undefined;
      try {
        // Fixed official host, validated ID only: never fetch a pasted arbitrary URL.
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) { reply('That video is private, unavailable, or cannot be embedded. Try another link.'); return; }
        const data = await response.json() as { title?: unknown };
        if (typeof data.title === 'string') title = data.title;
      } catch { reply('YouTube did not respond. Try that link again in a moment.'); return; }
      if (this.broadcast.getSocketPrincipal(socket)?.ownerId !== principal.ownerId) return;
      result = this.queue.enqueue(id, principal.username, Date.now(), title);
    } else if (message.action === 'reorder') result = this.queue.reorder(message.ids, message.revision);
    else if (message.action === 'duration') result = this.queue.duration(message.entryId, message.seconds, now);
    else if (message.action === 'skip') result = this.queue.skip(message.entryId, now);
    else { reply('That radio action is unavailable.'); return; }
    this.broadcast.sendTo(socket, { ...result, silent });
    if (result.success) this.broadcast.broadcastRadio(this.queue.snapshot(Date.now()));
  }
  tick() {
    const now = Date.now();
    if (this.queue.advance(now)) this.broadcast.broadcastRadio(this.queue.snapshot(now));
    for (const [owner, time] of this.lastRequest) if (now - time > 60000) this.lastRequest.delete(owner);
  }
}
