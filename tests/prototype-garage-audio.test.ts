import {afterEach, expect, it, vi} from 'vitest';
import {createFactoryAudio} from '../client/prototypes/factory25dAudio';

class Parameter {
  value = 0;
  cancelAndHoldAtTime = vi.fn();
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value; });
  setValueCurveAtTime = vi.fn();
}
class Node {
  connections: unknown[] = [];
  disconnect = vi.fn();
  connect(target: unknown) { this.connections.push(target); return target; }
}
class Source extends Node {
  frequency = new Parameter();
  playbackRate = new Parameter();
  start = vi.fn();
  stop = vi.fn();
  setPeriodicWave = vi.fn();
  onended?: () => void;
}
class Context {
  state = 'suspended';
  currentTime = 1;
  sampleRate = 48000;
  destination = new Node();
  gains: Array<Node & {gain: Parameter}> = [];
  oscillators: Source[] = [];
  sources: Source[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createGain() { const gain = Object.assign(new Node(), {gain: new Parameter()}); this.gains.push(gain); return gain; }
  createOscillator() { const source = new Source(); this.oscillators.push(source); this.sources.push(source); return source; }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createBiquadFilter() { return Object.assign(new Node(), {frequency: new Parameter(), Q: new Parameter()}); }
  createStereoPanner() { return Object.assign(new Node(), {pan: new Parameter()}); }
  createPeriodicWave() { return {}; }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return {getChannelData: () => data}; }
  decodeAudioData = vi.fn(async () => ({duration: 6}));
}
class Control extends EventTarget {
  value = ''; textContent = ''; hidden = false;
  setAttribute() {}
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('keeps engines opt-in, shares the ambient master, bounds revs and stops on leave, mute, hidden tab and disposal', async () => {
  vi.useFakeTimers();
  const controls = new Map(['scene-sound-toggle', 'scene-volume', 'scene-sound-level', 'scene-volume-value', 'scene-sound-status'].map(id => [`#${id}`, new Control()]));
  const document = Object.assign(new EventTarget(), {hidden: false, querySelector: (selector: string) => controls.get(selector)});
  const contexts: Context[] = [];
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', {setTimeout});
  vi.stubGlobal('localStorage', {getItem: () => null, setItem() {}});
  vi.stubGlobal('AudioContext', class extends Context { constructor() { super(); contexts.push(this); } });
  const fetch = vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)}));
  vi.stubGlobal('fetch', fetch);
  const audio = createFactoryAudio();
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const toggle = controls.get('#scene-sound-toggle')!;

  audio.garageEngine({car: 'mini', throttle: 1});
  expect(contexts).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
  toggle.dispatchEvent(new Event('click')); await flush();
  expect(contexts).toHaveLength(1);
  const context = contexts[0], master = context.gains[0];
  expect(master.connections).toEqual([context.destination]);
  expect(context.oscillators).toHaveLength(0);
  expect(fetch).toHaveBeenCalledTimes(9); // Existing ambient recordings; engines fetch nothing.

  const before = context.gains.length;
  audio.garageEngine({car: 'mini', throttle: 0});
  const engineOutput = context.gains[before], mini = context.oscillators[0];
  expect(engineOutput.connections).toEqual([master]);
  const idle = mini.frequency.value;
  context.currentTime += .1;
  audio.garageEngine({car: 'mini', throttle: 100});
  expect(mini.frequency.value).toBeGreaterThan(idle);
  expect(mini.frequency.value).toBe(165);
  expect(engineOutput.gain.value).toBeLessThan(.1);
  context.currentTime += .1;
  audio.garageEngine({car: 'mini', throttle: NaN});
  expect(mini.frequency.value).toBe(idle);

  audio.garageEngine({car: 'f1', throttle: 1});
  const f1 = context.oscillators[3];
  expect(f1.frequency.value).toBeGreaterThan(mini.frequency.value * 4);
  expect(mini.stop).toHaveBeenCalledWith(context.currentTime + .15);
  audio.garageEngine(undefined);
  expect(f1.stop).toHaveBeenCalledWith(context.currentTime + .15);

  audio.garageEngine({car: 'mini', throttle: 1});
  const muted = context.oscillators[6];
  toggle.dispatchEvent(new Event('click')); await flush();
  expect(master.gain.value).toBe(0);
  expect(muted.stop).toHaveBeenCalledWith(context.currentTime + .15);
  await vi.advanceTimersByTimeAsync(180);
  expect(context.state).toBe('suspended');

  toggle.dispatchEvent(new Event('click')); await flush();
  audio.garageEngine({car: 'porsche', throttle: 1});
  const hidden = context.oscillators[9];
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(master.gain.value).toBe(0);
  expect(hidden.stop).toHaveBeenCalledWith(context.currentTime + .15);
  await vi.advanceTimersByTimeAsync(180);
  expect(context.state).toBe('suspended');
  audio.garageEngine({car: 'mini', throttle: 1});
  expect(context.oscillators).toHaveLength(12);

  audio.dispose();
  expect(context.close).toHaveBeenCalledOnce();
  expect(context.oscillators.every(source => source.stop.mock.calls.length > 0 && source.disconnect.mock.calls.length > 0)).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(9);
  expect(contexts).toHaveLength(1);
});

it('keeps thunder opt-in, reuses its rumble, and drops old claps on mute or a hidden tab', async () => {
  vi.useFakeTimers();
  const controls = new Map(['scene-sound-toggle', 'scene-volume', 'scene-sound-level', 'scene-volume-value', 'scene-sound-status'].map(id => [`#${id}`, new Control()]));
  const document = Object.assign(new EventTarget(), {hidden: false, querySelector: (selector: string) => controls.get(selector)});
  const contexts: Context[] = [];
  vi.stubGlobal('document', document); vi.stubGlobal('window', {setTimeout});
  vi.stubGlobal('localStorage', {getItem: () => null, setItem() {}});
  vi.stubGlobal('AudioContext', class extends Context { constructor() { super(); contexts.push(this); } });
  const fetch = vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)})); vi.stubGlobal('fetch', fetch);
  const audio = createFactoryAudio(), toggle = controls.get('#scene-sound-toggle')!;
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  audio.thunder(); expect(contexts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  toggle.dispatchEvent(new Event('click')); await flush();
  const context = contexts[0], makeBuffer = vi.spyOn(context, 'createBuffer');
  const before = context.sources.length;
  audio.thunder(.8, -.2); expect(context.sources).toHaveLength(before + 1);
  const clap = context.sources.at(-1)!;
  expect(clap.start).toHaveBeenCalledWith(context.currentTime);
  expect(clap.stop).toHaveBeenCalledWith(context.currentTime + 3.8);
  audio.thunder(); expect(context.sources).toHaveLength(before + 1); // Bounded even if called twice.
  expect(makeBuffer).toHaveBeenCalledOnce();
  toggle.dispatchEvent(new Event('click')); await flush();
  expect(clap.stop).toHaveBeenLastCalledWith();
  audio.thunder(); expect(context.sources).toHaveLength(before + 1);
  toggle.dispatchEvent(new Event('click')); await flush(); context.currentTime += 5;
  audio.thunder(); const hiddenClap = context.sources.at(-1)!;
  expect(context.sources).toHaveLength(before + 2); expect(makeBuffer).toHaveBeenCalledOnce();
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(hiddenClap.stop).toHaveBeenLastCalledWith();
  context.currentTime += 5; audio.thunder(); expect(context.sources).toHaveLength(before + 2);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flush();
  const resumedSources = context.sources.length; // Ambient beds may start their next overlap on return.
  const volume = controls.get('#scene-volume')!; volume.value = '0'; volume.dispatchEvent(new Event('input'));
  audio.thunder(); expect(context.sources).toHaveLength(resumedSources);
  expect(fetch).toHaveBeenCalledTimes(9); // Synthesized thunder adds no remote recording dependency.
  audio.dispose(); context.currentTime += 5; audio.thunder(); expect(context.sources).toHaveLength(resumedSources);
});

it('keeps vending and light actions in the opt-in mixer and cancels them on zero volume, hide and disposal', async () => {
  vi.useFakeTimers();
  const controls = new Map(['scene-sound-toggle', 'scene-volume', 'scene-sound-level', 'scene-volume-value', 'scene-sound-status'].map(id => [`#${id}`, new Control()]));
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: (selector: string) => controls.get(selector) });
  const contexts: Context[] = [];
  vi.stubGlobal('document', document); vi.stubGlobal('window', { setTimeout });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
  vi.stubGlobal('AudioContext', class extends Context { constructor() { super(); contexts.push(this); } });
  const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })); vi.stubGlobal('fetch', fetch);
  const audio = createFactoryAudio(), toggle = controls.get('#scene-sound-toggle')!;
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  audio.vendingSelect(); audio.vendingDispense(); audio.vendingLand(); audio.lampSwitch(); audio.candle(true);
  expect(contexts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  toggle.dispatchEvent(new Event('click')); await flush();
  const context = contexts[0], before = context.sources.length;
  for (let click = 0; click < 100; click++) audio.vendingSelect();
  expect(context.sources).toHaveLength(before + 1);
  audio.vendingDispense(); audio.vendingLand(); audio.lampSwitch(false); audio.candle(true); audio.candle(false);
  expect(context.sources).toHaveLength(before + 6);
  const cues = context.sources.slice(before);
  const volume = controls.get('#scene-volume')!; volume.value = '0'; volume.dispatchEvent(new Event('input'));
  expect(cues.every(cue => cue.stop.mock.lastCall?.length === 0 && cue.disconnect.mock.calls.length > 0)).toBe(true);
  context.currentTime += 1;
  audio.vendingSelect(); audio.lampSwitch(); audio.candle(true);
  expect(context.sources).toHaveLength(before + 6);
  volume.value = '40'; volume.dispatchEvent(new Event('input'));
  audio.vendingDispense(); const motor = context.sources.at(-1)!;
  audio.stopPropSounds(); expect(motor.stop).toHaveBeenLastCalledWith();
  context.currentTime += 1; audio.lampSwitch(); const hidden = context.sources.at(-1)!;
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(hidden.stop).toHaveBeenLastCalledWith();
  const hiddenCount = context.sources.length; audio.vendingSelect(); expect(context.sources).toHaveLength(hiddenCount);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flush();
  context.currentTime += 1; audio.candle(true); const flame = context.sources.at(-1)!;
  const lastCount = context.sources.length; audio.dispose();
  expect(flame.stop).toHaveBeenLastCalledWith(); expect(context.close).toHaveBeenCalledOnce();
  context.currentTime += 1; audio.vendingSelect(); expect(context.sources).toHaveLength(lastCount);
  expect(fetch).toHaveBeenCalledTimes(9); // Reuses the same local ambient sample load, adds no asset request.
});

it('plays one opt-in phone buzz and can stop it without cancelling another room effect', async () => {
  vi.useFakeTimers();
  const controls = new Map(['scene-sound-toggle', 'scene-volume', 'scene-sound-level', 'scene-volume-value', 'scene-sound-status'].map(id => [`#${id}`, new Control()]));
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: (selector: string) => controls.get(selector) });
  const contexts: Context[] = [];
  vi.stubGlobal('document', document); vi.stubGlobal('window', { setTimeout });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {} });
  vi.stubGlobal('AudioContext', class extends Context { constructor() { super(); contexts.push(this); } });
  const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })); vi.stubGlobal('fetch', fetch);
  const audio = createFactoryAudio(), toggle = controls.get('#scene-sound-toggle')!;
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  audio.phoneBuzz(); expect(contexts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  toggle.dispatchEvent(new Event('click')); await flush();
  const context = contexts[0]; audio.vendingDispense(); const motor = context.sources.at(-1)!;
  const before = context.sources.length;
  for (let message = 0; message < 20; message++) audio.phoneBuzz();
  expect(context.sources).toHaveLength(before + 1);
  const phone = context.sources.at(-1)!;
  expect(phone.stop).toHaveBeenCalledWith(context.currentTime + .24);
  audio.stopPhoneBuzz(); expect(phone.stop).toHaveBeenLastCalledWith();
  expect(motor.stop).toHaveBeenLastCalledWith(context.currentTime + .32);
  context.currentTime += 2; audio.phoneBuzz(); const muted = context.sources.at(-1)!;
  const volume = controls.get('#scene-volume')!; volume.value = '0'; volume.dispatchEvent(new Event('input'));
  expect(muted.stop).toHaveBeenLastCalledWith();
  const count = context.sources.length; audio.phoneBuzz(); expect(context.sources).toHaveLength(count);
  volume.value = '40'; volume.dispatchEvent(new Event('input')); expect(context.sources).toHaveLength(count);
  context.currentTime += 2; audio.phoneBuzz(); const hidden = context.sources.at(-1)!;
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(hidden.stop).toHaveBeenLastCalledWith();
  const hiddenCount = context.sources.length; audio.phoneBuzz(); expect(context.sources).toHaveLength(hiddenCount);
  audio.dispose(); audio.phoneBuzz(); expect(context.sources).toHaveLength(hiddenCount);
  expect(fetch).toHaveBeenCalledTimes(9);
});
