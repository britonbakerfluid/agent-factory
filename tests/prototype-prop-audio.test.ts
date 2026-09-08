import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPropAudio, propSoundSamples, PROP_SOUND_SPECS, PROP_SOUND_VOICE_LIMIT,
  type PropSoundKind } from '../client/prototypes/factory25dPropAudio';
import { VendingSoundEvents } from '../client/prototypes/factory25dVendingSoundEvents';
import type { VendingCanBody } from '../client/prototypes/factory25dVendingPhysics';

class AudioNodeMock {
  connections: unknown[] = [];
  disconnect = vi.fn();
  connect(node: unknown) { this.connections.push(node); return node; }
}
class AudioSourceMock extends AudioNodeMock {
  onended: (() => void) | null = null;
  start = vi.fn(); stop = vi.fn();
}

it('makes short quiet action sounds with softened edges and no downloaded samples', () => {
  const prints = new Set<string>();
  for (const kind of Object.keys(PROP_SOUND_SPECS) as PropSoundKind[]) {
    const samples = propSoundSamples(kind, 48000);
    expect(samples.length / 48000).toBeLessThanOrEqual(kind === 'phone-buzz' ? .61 : .32);
    expect(samples[0]).toBe(0); expect(Math.abs(samples.at(-1)!)).toBeLessThan(.002);
    expect(samples.some(sample => Math.abs(sample) > .03)).toBe(true);
    expect(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= .75)).toBe(true);
    prints.add(String(samples.slice(50, 60)));
  }
  expect(prints.size).toBe(Object.keys(PROP_SOUND_SPECS).length);
});

it('leaves silence between the phone motor rattles', () => {
  const samples = propSoundSamples('phone-buzz', 48000);
  expect(samples.slice(0, 12000).some(sample => Math.abs(sample) > .03)).toBe(true);
  expect(samples.slice(12001, 17280).every(sample => sample === 0)).toBe(true);
  expect(samples.slice(17280).some(sample => Math.abs(sample) > .03)).toBe(true);
});

it('caps overlapping voices and repeat clicks, reuses buffers, and cancels all tails without replay', () => {
  const destination = new AudioNodeMock(), sources: AudioSourceMock[] = [], gains: AudioNodeMock[] = [];
  const context = {
    currentTime: 1, sampleRate: 48000,
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createGain: () => { const node = Object.assign(new AudioNodeMock(), { gain: { value: 0 } }); gains.push(node); return node; },
    createBufferSource: () => { const node = new AudioSourceMock(); sources.push(node); return node; },
  };
  const audio = createPropAudio(context as unknown as BaseAudioContext, destination as unknown as AudioNode);
  expect(sources).toHaveLength(0); expect(context.createBuffer).not.toHaveBeenCalled();
  const kinds = Object.keys(PROP_SOUND_SPECS) as PropSoundKind[];
  for (const kind of kinds.slice(0, PROP_SOUND_VOICE_LIMIT)) expect(audio.play(kind)).toBe(true);
  expect(audio.play(kinds[PROP_SOUND_VOICE_LIMIT])).toBe(false);
  expect(audio.activeVoiceCount).toBe(PROP_SOUND_VOICE_LIMIT);
  for (let click = 0; click < 100; click++) expect(audio.play('vending-select')).toBe(false);
  expect(sources).toHaveLength(6); expect(context.createBuffer).toHaveBeenCalledTimes(6);
  expect(gains.every(gain => gain.connections[0] === destination)).toBe(true);
  context.currentTime += .2;
  expect(audio.play('vending-select')).toBe(true);
  expect(context.createBuffer).toHaveBeenCalledTimes(6);
  const tail = sources.at(-1)!;
  audio.stop(); expect(audio.activeVoiceCount).toBe(0); expect(tail.stop).toHaveBeenLastCalledWith();
  expect(tail.disconnect).toHaveBeenCalled();
  const before = sources.length; context.currentTime += 2;
  expect(audio.activeVoiceCount).toBe(0); expect(sources).toHaveLength(before);
  expect(audio.play('vending-land', NaN)).toBe(false); expect(audio.play('vending-land', 0)).toBe(false);
  audio.dispose(); expect(audio.play('vending-select')).toBe(false);
});

it('plays on actual emission and first contact rather than every update or wake-up', () => {
  const sounds = { select: vi.fn(), dispense: vi.fn(), land: vi.fn(), stop: vi.fn() };
  const events = new VendingSoundEvents(); events.configure(sounds);
  const body: VendingCanBody = { id: 1, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, -.9, 0), angularVelocity: new THREE.Vector3(),
    sleeping: false, supported: false, quietTime: 0 };
  events.select(true, true); events.select(false, true); events.select(true, false);
  expect(sounds.select).toHaveBeenCalledOnce();
  expect(sounds.dispense).not.toHaveBeenCalled();
  events.update([body], true); events.update([body], true);
  expect(sounds.dispense).toHaveBeenCalledOnce(); expect(sounds.land).not.toHaveBeenCalled();
  body.supported = true; body.velocity.y = 0;
  events.update([body], true);
  expect(sounds.land).toHaveBeenCalledOnce(); expect(sounds.land).toHaveBeenCalledWith(.5);
  body.supported = false; events.update([body], true); body.supported = true; events.update([body], true);
  expect(sounds.land).toHaveBeenCalledOnce();
  events.update([body], false); events.update([body], false);
  expect(sounds.stop).toHaveBeenCalledOnce();
  events.update([body], true); expect(sounds.dispense).toHaveBeenCalledOnce(); expect(sounds.land).toHaveBeenCalledOnce();
  events.remove(body.id); events.dispose(); expect(sounds.stop).toHaveBeenCalledTimes(2);
});
