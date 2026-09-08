export const PROP_SOUND_SPECS = {
  'vending-select': { seconds: .105, cooldown: .09, gain: .42 },
  'vending-dispense': { seconds: .32, cooldown: .18, gain: .45 },
  'vending-land': { seconds: .15, cooldown: .075, gain: .5 },
  'lamp-switch': { seconds: .055, cooldown: .085, gain: .4 },
  'candle-on': { seconds: .23, cooldown: .18, gain: .42 },
  'candle-off': { seconds: .18, cooldown: .18, gain: .38 },
  'phone-buzz': { seconds: .61, cooldown: 1.45, gain: .62 },
} as const;
export type PropSoundKind = keyof typeof PROP_SOUND_SPECS;
export const PROP_SOUND_VOICE_LIMIT = 6;

/** Small deterministic waveforms; no sample downloads, running oscillators or
 * continuous vending hum. Reusable buffers are only built on an audible action. */
export function propSoundSamples(kind: PropSoundKind, sampleRate: number): Float32Array {
  const rate = Math.max(8000, Number.isFinite(sampleRate) ? sampleRate : 48000);
  const duration = PROP_SOUND_SPECS[kind].seconds;
  const output = new Float32Array(Math.ceil(rate * duration));
  let seed = 4137, brown = 0;
  const sine = (frequency: number, time: number) => Math.sin(2 * Math.PI * frequency * time);
  for (let i = 0; i < output.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    brown = brown * .92 + noise * .08;
    let sample = 0;
    if (kind === 'vending-select') {
      const tone = t < .044 ? 0 : .054;
      const local = t - tone;
      const envelope = local >= 0 && local < .042 ? Math.sin(Math.PI * local / .042) ** 2 : 0;
      sample = sine(tone ? 1430 : 1060, local) * envelope * .26;
    } else if (kind === 'vending-dispense') {
      const envelope = Math.sin(Math.PI * t / duration) ** .7;
      const rattle = Math.exp(-Math.max(0, t - .105) * 38) * Number(t > .105)
        + Math.exp(-Math.max(0, t - .215) * 42) * Number(t > .215);
      sample = (sine(91, t) * .18 + sine(183, t) * .035 + brown * .37 + noise * rattle * .16) * envelope;
    } else if (kind === 'vending-land') {
      const attack = Math.min(1, t / .003), decay = Math.exp(-t * 30);
      sample = (sine(158, t) * .36 + sine(286, t) * .065 + noise * .12) * attack * decay;
    } else if (kind === 'lamp-switch') {
      sample = (noise * .22 + sine(930, t) * .13) * Math.min(1, t / .002) * Math.exp(-t * 75);
    } else if (kind === 'candle-on') {
      const scrape = Math.exp(-t * 29), flare = Math.sin(Math.PI * t / duration) ** 2;
      sample = noise * .17 * scrape + brown * .6 * flare;
    } else if (kind === 'phone-buzz') {
      // Two short motor rattles, synchronized with the handset's two nudges.
      const packetTime = t < .25 ? t : t - .36;
      const envelope = packetTime >= 0 && packetTime <= .25
        ? Math.sin(Math.PI * packetTime / .25) ** .7 * (t < .25 ? 1 : .8) : 0;
      sample = (sine(137, t) * .24 + sine(274, t) * .035 + brown * .12) * envelope;
    } else {
      sample = brown * .85 * Math.sin(Math.PI * t / duration) ** 2;
    }
    const edge = Math.min(1, t / .002, (duration - t) / .008);
    output[i] = Math.max(-.75, Math.min(.75, sample * Math.max(0, edge)));
  }
  return output;
}

interface PropVoice { source: AudioBufferSourceNode; envelope: GainNode; endsAt: number; kind: PropSoundKind }

/** Transient sounds feed the existing room-effects bus and its master volume. */
export function createPropAudio(context: BaseAudioContext, destination: AudioNode) {
  const buffers = new Map<PropSoundKind, AudioBuffer>();
  const voices = new Set<PropVoice>();
  const lastPlayed = new Map<PropSoundKind, number>();
  let disposed = false;
  function release(voice: PropVoice) {
    voices.delete(voice); voice.source.disconnect(); voice.envelope.disconnect();
  }
  function stop(kind?: PropSoundKind) {
    for (const voice of [...voices]) if (!kind || voice.kind === kind) { voice.source.stop(); release(voice); }
    if (kind) lastPlayed.delete(kind); else lastPlayed.clear();
  }
  return {
    play(kind: PropSoundKind, energy = 1) {
      if (disposed) return false;
      const strength = Math.max(0, Math.min(1, Number.isFinite(energy) ? energy : 0));
      if (!strength) return false;
      const spec = PROP_SOUND_SPECS[kind], start = context.currentTime;
      if (start - (lastPlayed.get(kind) ?? -Infinity) < spec.cooldown) return false;
      for (const voice of [...voices]) if (voice.endsAt <= start) release(voice);
      if (voices.size >= PROP_SOUND_VOICE_LIMIT) return false;
      lastPlayed.set(kind, start);
      let buffer = buffers.get(kind);
      if (!buffer) {
        const samples = propSoundSamples(kind, context.sampleRate);
        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        buffer.getChannelData(0).set(samples); buffers.set(kind, buffer);
      }
      const source = context.createBufferSource(); source.buffer = buffer;
      const envelope = context.createGain(); envelope.gain.value = spec.gain * strength;
      source.connect(envelope).connect(destination);
      const voice = { source, envelope, endsAt: start + spec.seconds, kind };
      voices.add(voice); source.onended = () => release(voice);
      source.start(start); source.stop(voice.endsAt);
      return true;
    },
    stop,
    get activeVoiceCount() { return voices.size; },
    dispose() { if (disposed) return; disposed = true; stop(); buffers.clear(); },
  };
}
