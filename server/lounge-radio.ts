import type { WebSocket } from '@fastify/websocket';
import type { BroadcastManager } from './ws/broadcast.js';
import { LoungeRadioQueue, youtubeVideoId, type RadioRequest } from '../shared/lounge-radio.js';

export class LoungeRadio {
  private queue = new LoungeRadioQueue();
  private lastRequest = new Map<string, number>();
  private scratchOwner = '';
  private scratchUntil = 0;
  private scratchStarted = 0;
  private scratchCooldown = 0;
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
    const now = Date.now();
    // A request may reach the track boundary before the timer does. Publish that
    // advance even when the request now refers to an expired entry or revision.
    if (this.queue.advance(now)) this.broadcast.broadcastRadio(this.queue.snapshot(now));
    if (message.action === 'scratch') {
      const current = this.queue.snapshot(now).current;
      if (!current || message.entryId !== current.id || ![0, 1].includes(message.deck)
        || !Number.isFinite(message.offset) || Math.abs(message.offset) > .8) return;
      if (now < this.scratchCooldown || now < this.scratchUntil && this.scratchOwner !== principal.ownerId) return;
      const key = `${principal.ownerId}:scratch`;
      if (now - (this.lastRequest.get(key) ?? -Infinity) < 120) return;
      if (now >= this.scratchUntil) this.scratchStarted = now;
      if (now - this.scratchStarted >= 3000) { this.scratchCooldown = now + 1000; return; }
      this.lastRequest.set(key, now); this.scratchOwner = principal.ownerId;
      this.scratchUntil = message.offset === 0 ? now : now + 350;
      this.broadcast.broadcastRadio({ type: 'radio_scratch', entryId: current.id, deck: message.deck, offset: message.offset, serverTime: now });
      return;
    }
    const key = `${principal.ownerId}:${silent ? 'duration' : 'queue'}`;
    if (now - (this.lastRequest.get(key) ?? -Infinity) < (silent ? 1000 : 500)) { reply('Give the queue a moment, then try again.'); return; }
    this.lastRequest.set(key, now);
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
    } else if (message.action === 'remove') result = this.queue.remove(message.entryId, message.revision);
    else if (message.action === 'reorder') result = this.queue.reorder(message.ids, message.revision);
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
