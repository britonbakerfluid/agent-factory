import { describe, expect, it } from 'vitest';
import type { ChatMessage, WSMessageToClient, WorldSnapshot } from '../shared/types';
import { PhoneMessageArrivals, PhoneNotificationPulse, PHONE_NOTIFICATION_MS } from '../client/prototypes/factory25dPhoneNotifications';

const chat = (message: string, timestamp: number, username = 'Ada'): ChatMessage => ({ message, timestamp, username });
const snapshot = (revision: number, messages: ChatMessage[] = []): WSMessageToClient => ({
  type: 'world_snapshot', snapshot: { revision, chat: messages } as WorldSnapshot,
});
const append = (previousRevision: number, messages: ChatMessage[], revision = previousRevision + 1): WSMessageToClient => ({
  type: 'world_delta', delta: { previousRevision, revision, serverTime: 1000,
    changes: messages.map(message => ({ kind: 'chat_append', chat: message })) },
});

describe('phone message arrival detection', () => {
  it('ignores history and own echoes, then emits once for a genuinely new incoming message', () => {
    const arrivals = new PhoneMessageArrivals(); arrivals.setOwnUsername('Briton');
    const old = chat('history', 100), next = chat('new message', 200);
    expect(arrivals.receive(snapshot(10, [old]))).toBe(0);
    expect(arrivals.receive(append(10, [next]))).toBe(1);
    expect(arrivals.receive(append(10, [next]))).toBe(0); // Duplicate delta.
    expect(arrivals.receive(append(11, [next]))).toBe(0); // Duplicate server echo.
    expect(arrivals.receive(append(12, [chat('my outgoing message', 300, 'briton')]))).toBe(0);
    expect(arrivals.receive(append(13, [chat('command response', 400, 'system')]))).toBe(0);
    expect(arrivals.receive(append(14, [chat('later message', 500)]))).toBe(1);
  });

  it('never replays reconnect catch-up, missing revisions, or legacy copies of the same chat', () => {
    const arrivals = new PhoneMessageArrivals();
    expect(arrivals.receive(append(0, [chat('before baseline', 1)]))).toBe(0);
    arrivals.receive(snapshot(1));
    const unseen = chat('while disconnected', 200);
    arrivals.disconnect(); expect(arrivals.receive(append(1, [unseen]))).toBe(0);
    expect(arrivals.receive(snapshot(5, [unseen]))).toBe(0);
    expect(arrivals.receive({ type: 'chat_message', chat: unseen })).toBe(0);
    expect(arrivals.receive(append(8, [chat('missing revisions', 300)]))).toBe(0);
    expect(arrivals.receive(append(5, [chat('awaiting repair', 310)]))).toBe(0);
    expect(arrivals.receive(snapshot(9, [unseen, chat('missing revisions', 300)]))).toBe(0);
    expect(arrivals.receive(append(9, [chat('new after reconnect', 400)]))).toBe(1);
  });

  it('seeds an already-loaded world without alerting and remembers outgoing identity through logout', () => {
    const arrivals = new PhoneMessageArrivals();
    arrivals.seed(100, [chat('already loaded', 1000)]);
    arrivals.setOwnUsername('Ada'); arrivals.setOwnUsername(undefined);
    expect(arrivals.receive(append(100, [chat('late own echo', 1100)]))).toBe(0);
    expect(arrivals.receive(append(101, [chat('other person', 1200, 'Grace')]))).toBe(1);
  });

  it('consumes offscreen arrivals so returning does not cause an old alert', () => {
    const arrivals = new PhoneMessageArrivals(); arrivals.receive(snapshot(0));
    const message = append(0, [chat('while reading another room', 100)]);
    expect(arrivals.receive(message)).toBe(1); // View chooses not to display/play it.
    expect(arrivals.receive(message)).toBe(0);
    expect(arrivals.receive(snapshot(1, [chat('while reading another room', 100)]))).toBe(0);
  });

  it('does not break the shared message listener when a malformed chat arrives', () => {
    const arrivals = new PhoneMessageArrivals(); arrivals.receive(snapshot(0));
    expect(arrivals.receive(append(0, [null, { username: 2 }] as unknown as ChatMessage[]))).toBe(0);
    expect(arrivals.receive(append(1, [chat('valid next frame', 200)]))).toBe(1);
  });
});

describe('phone notification motion', () => {
  it('has one short buzz and one finite glow, coalescing bursts without a repeating queue', () => {
    const pulse = new PhoneNotificationPulse();
    expect(pulse.trigger(1000)).toBe(true); expect(pulse.trigger(1100)).toBe(false);
    let vibration = false;
    for (let elapsed = 0; elapsed < PHONE_NOTIFICATION_MS; elapsed += 10) {
      const state = pulse.sample(1000 + elapsed, false);
      expect(state.glow).toBeGreaterThanOrEqual(0); expect(state.glow).toBeLessThanOrEqual(1);
      expect(Math.abs(state.offset)).toBeLessThanOrEqual(.003); expect(Math.abs(state.twist)).toBeLessThanOrEqual(.01);
      if (elapsed > 220) expect(state.offset).toBe(0);
      if (state.offset !== 0) vibration = true;
    }
    expect(vibration).toBe(true);
    expect(pulse.sample(1000 + PHONE_NOTIFICATION_MS, false)).toEqual({ glow: 0, offset: 0, twist: 0, active: false });
    expect(pulse.sample(9000, false).active).toBe(false);
    expect(pulse.trigger(9000)).toBe(true);
  });

  it('keeps reduced motion steady and cancels immediately when the phone is opened or hidden', () => {
    const pulse = new PhoneNotificationPulse(); pulse.trigger(100);
    for (let elapsed = 0; elapsed < PHONE_NOTIFICATION_MS; elapsed += 20) {
      const state = pulse.sample(100 + elapsed, true);
      expect(state.offset).toBe(0); expect(state.twist).toBe(0);
    }
    expect(pulse.sample(400, true).glow).toBe(1);
    pulse.cancel(); expect(pulse.sample(401, false).active).toBe(false);
    expect(pulse.sample(401, false).glow).toBe(0);
  });
});
