import type { WebSocket } from '@fastify/websocket';
import type { BroadcastManager } from './ws/broadcast.js';
import { BasketballChallengeBook, HORSE_SHOT_GAP_MS, readChallenge, type BasketballChallenge, type ChallengePerson, type ChallengeRequest, type ChallengeResult } from '../shared/basketball-challenge.js';

export interface ChallengeRepository {
  loadChallenges(): Promise<unknown[]>;
  saveChallenges(challenges: BasketballChallenge[]): Promise<void>;
  deleteChallenges(ids: string[]): Promise<void>;
}

/**
 * Durable, owner-addressed HORSE games. The book decides; this class
 * authenticates, rate-limits, persists and delivers. A person gets their whole
 * list on every connect and after every change, on every device, so repeated
 * or reordered deliveries are harmless.
 */
export class BasketballChallenges {
  private book = new BasketballChallengeBook();
  private dirty = new Map<string, BasketballChallenge>();
  private removed = new Set<string>();
  private undeliveredWelcome = new Set<string>();
  private pending: Promise<void> = Promise.resolve();
  private lastShot = new Map<string, number>();
  private lastRequest = new Map<string, number>();
  private healthy = true;
  constructor(private repository: ChallengeRepository, private broadcast: BroadcastManager,
    private person: (ownerId: string) => ChallengePerson | undefined, private now = Date.now, private welcomeOwnerId?: string) {}

  async initialize() {
    let stored: unknown[] = [];
    try { stored = await this.repository.loadChallenges(); } catch { this.healthy = false; }
    // Records from the earlier ten-shot format (or anything malformed) are deleted, never reinterpreted.
    for (const row of stored) {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;
      if (typeof id === 'string' && !readChallenge(row)) this.removed.add(id);
    }
    this.book = new BasketballChallengeBook(stored);
    for (const id of this.book.expire(this.now())) this.mark(id);
    await this.flush();
  }
  get persistenceHealthy() { return this.healthy; }
  private mark(id: string) { const game = this.book.get(id); if (game) this.dirty.set(id, game); }
  private state(ownerId: string) {
    return { type: 'challenge_state' as const, serverTime: this.now(), challenges: this.book.forOwner(ownerId).filter(game => !(game.welcome && ((!['pending', 'playing'].includes(game.status) && game.expiresAt <= this.now()) || this.undeliveredWelcome.has(game.id)))) };
  }
  sendActive(socket: WebSocket) {
    const principal = this.broadcast.getSocketPrincipal(socket);
    if (!principal) return;
    const sender = this.welcomeOwnerId && this.person(this.welcomeOwnerId);
    const recipient = this.person(principal.ownerId);
    const id = sender && recipient ? this.book.welcome(sender, recipient, this.now()) : undefined;
    if (id) { this.undeliveredWelcome.add(id); this.mark(id); }
    if (id || this.undeliveredWelcome.has(`welcome_horse_v1_${principal.ownerId}`)) {
      void this.flush().then(() => {
        // The socket may have logged out while storage was pending.
        if (this.broadcast.getSocketPrincipal(socket)?.ownerId !== principal.ownerId) return;
        if (id && this.healthy) this.publish(id);
        else this.broadcast.sendTo(socket, this.state(principal.ownerId));
      });
    } else this.broadcast.sendTo(socket, this.state(principal.ownerId));
  }
  private publish(id: string) {
    const game = this.book.get(id);
    if (!game) return;
    for (const ownerId of new Set([game.challenger.ownerId, game.challengee.ownerId])) this.broadcast.sendToOwner(ownerId, this.state(ownerId));
  }
  receive(socket: WebSocket, message: ChallengeRequest) {
    const action = typeof message?.action === 'string' ? message.action : 'create';
    const reply = (result: ChallengeResult) => this.broadcast.sendTo(socket, result);
    const principal = this.broadcast.getSocketPrincipal(socket);
    if (!principal) { reply({ type: 'challenge_result', success: false, action, error: 'Connect your browser to play HORSE.' }); return; }
    const now = this.now();
    const throttleKey = `${principal.ownerId}:${action}`;
    if (now - (this.lastRequest.get(throttleKey) ?? -Infinity) < 120) { reply({ type: 'challenge_result', success: false, action, error: 'One moment.' }); return; }
    this.lastRequest.set(throttleKey, now);
    let result: ChallengeResult;
    if (message.action === 'create') {
      const challengee = typeof message.challengeeId === 'string' ? this.person(message.challengeeId) : undefined;
      if (!challengee) { reply({ type: 'challenge_result', success: false, action, error: 'Pick someone from the team list.' }); return; }
      result = this.book.create({ ownerId: principal.ownerId, name: principal.username }, challengee, now);
    } else if (message.action === 'cancel') result = this.book.cancel(String(message.id), principal.ownerId, now);
    else if (message.action === 'respond') result = this.book.respond(String(message.id), principal.ownerId, message.accept === true, now);
    else if (message.action === 'seen') result = this.book.seen(String(message.id), principal.ownerId, now);
    else if (message.action === 'shot') {
      const id = String(message.id);
      if (now - (this.lastShot.get(id) ?? -Infinity) < HORSE_SHOT_GAP_MS) { reply({ type: 'challenge_result', success: false, action, id, error: 'Give the ball a moment.' }); return; }
      result = this.book.shot(id, principal.ownerId, message.revision, message.position, message.velocity, now, message.targetSpot);
      if (result.success) this.lastShot.set(id, now);
    } else { reply({ type: 'challenge_result', success: false, action, error: 'That challenge action is unavailable.' }); return; }
    reply(result);
    if (result.success && result.id) { const id = result.id; this.mark(id); if (this.book.get(id)?.welcome) void this.flush().then(() => { if (this.healthy) this.publish(id); }); else { this.publish(id); void this.flush(); } }
  }
  /** Runs on the shared one-second world timer. */
  tick() {
    const now = this.now();
    const expired = this.book.expire(now);
    for (const id of expired) { this.mark(id); this.publish(id); }
    for (const id of this.book.prune(now)) { this.dirty.delete(id); this.removed.add(id); }
    for (const [id, time] of this.lastShot) if (now - time > 60_000) this.lastShot.delete(id);
    for (const [owner, time] of this.lastRequest) if (now - time > 60_000) this.lastRequest.delete(owner);
    if (expired.length || this.removed.size || this.dirty.size) void this.flush();
  }
  flush(): Promise<void> {
    this.pending = this.pending.then(async () => {
      if (!this.dirty.size && !this.removed.size) return;
      const batch = [...this.dirty.values()], gone = [...this.removed];
      this.dirty.clear(); this.removed.clear();
      try {
        await this.repository.saveChallenges(batch);
        await this.repository.deleteChallenges(gone);
        this.healthy = true;
        for (const game of batch) if (game.welcome) { this.undeliveredWelcome.delete(game.id); this.publish(game.id); }
      } catch {
        this.healthy = false;
        for (const game of batch) if (!this.dirty.has(game.id) && this.book.get(game.id)) this.dirty.set(game.id, game);
        for (const id of gone) this.removed.add(id);
      }
    });
    return this.pending;
  }
}
