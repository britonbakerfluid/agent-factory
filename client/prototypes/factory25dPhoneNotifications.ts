import type { ChatMessage, WSMessageToClient } from '@shared/types';

const key = (message: ChatMessage) => JSON.stringify([message.username, message.message, message.timestamp]);
const isChat = (value: unknown): value is ChatMessage => !!value && typeof value === 'object'
  && 'username' in value && typeof value.username === 'string' && value.username.trim().length > 0
  && 'message' in value && typeof value.message === 'string' && value.message.trim().length > 0
  && 'timestamp' in value && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp);

/** Arrival means an ordered live append after a baseline, never a longer
 * history array. Disconnected/history changes are consumed without replay. */
export class PhoneMessageArrivals {
  private revision: number | undefined;
  private seen = new Set<string>();
  private ownNames = new Set<string>();

  setOwnUsername(username: string | undefined) {
    if (username) this.ownNames.add(username.toLocaleLowerCase());
  }
  disconnect() { this.revision = undefined; }
  baseline(revision: number, messages: readonly ChatMessage[]) {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    this.revision = revision;
    if (Array.isArray(messages)) for (const message of messages) if (isChat(message)) this.remember(message);
  }
  seed(revision: number | undefined, messages: readonly ChatMessage[]) {
    if (this.revision === undefined && revision !== undefined) this.baseline(revision, messages);
  }
  private remember(message: ChatMessage) {
    this.seen.add(key(message));
    while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
  }
  receive(message: WSMessageToClient): number {
    if (message.type === 'world_snapshot') {
      this.baseline(message.snapshot.revision, message.snapshot.chat ?? []);
      return 0;
    }
    if (message.type !== 'world_delta') return 0;
    const delta = message.delta;
    if (!delta || !Number.isSafeInteger(delta.revision) || !Array.isArray(delta.changes)) return 0;
    if (this.revision === undefined || delta.revision <= this.revision) return 0;
    if (delta.previousRevision !== this.revision) { this.revision = undefined; return 0; }
    this.revision = delta.revision;
    let incoming = 0;
    for (const change of delta.changes) {
      if (!change || change.kind !== 'chat_append') continue;
      const chat = change.chat;
      if (!isChat(chat)) continue;
      if (this.seen.has(key(chat))) continue;
      this.remember(chat);
      const username = chat.username.toLocaleLowerCase();
      if (username !== 'system' && !this.ownNames.has(username)) incoming++;
    }
    return incoming;
  }
}

export const PHONE_NOTIFICATION_MS = 1450;
export const PHONE_NOTIFICATION_COOLDOWN_MS = 8000;
export const PHONE_REMINDER_DELAYS_MS = [45_000, 90_000, 150_000] as const;

/** Only actual unread arrivals earn reminders. Pause away from the phone,
 * space reminders further apart, and never replay missed intervals. */
export class PhoneUnreadReminders {
  unread = false;
  private count = 0;
  private next = Infinity;
  private eligible = false;
  arrive(now: number, eligible: boolean) {
    if (!Number.isFinite(now)) return;
    this.unread = true; this.count = 0; this.eligible = eligible;
    this.next = now + PHONE_REMINDER_DELAYS_MS[0];
  }
  read() { this.unread = false; this.count = 0; this.next = Infinity; this.eligible = false; }
  pause() { this.eligible = false; }
  update(now: number, eligible: boolean) {
    if (!Number.isFinite(now) || !this.unread) return false;
    if (!eligible) { this.pause(); return false; }
    if (this.count >= PHONE_REMINDER_DELAYS_MS.length) return false;
    if (!this.eligible) {
      this.eligible = true; this.next = now + PHONE_REMINDER_DELAYS_MS[this.count];
      return false;
    }
    if (now < this.next) return false;
    this.count++;
    this.next = now + (PHONE_REMINDER_DELAYS_MS[this.count] ?? Infinity);
    return true;
  }
}

const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const rattle = (elapsed: number, start: number) => {
  const t = (elapsed - start) / 250;
  return t > 0 && t < 1 ? Math.sin(Math.PI * t) ** .7 : 0;
};

/** One finite pulse; a burst is coalesced while it is playing, without a queue. */
export class PhoneNotificationPulse {
  private started = -Infinity;
  trigger(now: number) {
    if (!Number.isFinite(now) || now - this.started < PHONE_NOTIFICATION_COOLDOWN_MS) return false;
    this.started = now; return true;
  }
  cancel() { this.started = -Infinity; }
  sample(now: number, reduced: boolean) {
    const elapsed = now - this.started;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= PHONE_NOTIFICATION_MS)
      return { glow: 0, offset: 0, twist: 0, rock: 0, lift: 0, marks: 0, active: false };
    const glow = ease(elapsed / 120) * (1 - ease((elapsed - 300) / (PHONE_NOTIFICATION_MS - 300)));
    const energy = reduced ? 0 : rattle(elapsed, 0) + rattle(elapsed, 360) * .8;
    const vibration = energy ? Math.sin(elapsed / 1000 * Math.PI * 2 * 11) * energy : 0;
    const rock = vibration * .11;
    return { glow, offset: vibration * .021, twist: vibration * .07, rock,
      lift: energy * .012 + Math.abs(rock) * .14, marks: energy, active: true };
  }
}
