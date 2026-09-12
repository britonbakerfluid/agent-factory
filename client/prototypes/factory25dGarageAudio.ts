export type GarageEngineCar = 'porsche' | 'mini' | 'delorean' | 'f1';
export type GarageEngineState = { car: GarageEngineCar; throttle: number };

const engines = {
  mini: { idle: 43, rev: 165, cutoff: 380, brightness: 650, sub: .27, rough: .012, harmonics: [0, 1, .48, .25, .13, .07] },
  porsche: { idle: 66, rev: 285, cutoff: 520, brightness: 1100, sub: .17, rough: .009, harmonics: [0, 1, .32, .47, .2, .14] },
  delorean: { idle: 55, rev: 220, cutoff: 440, brightness: 850, sub: .22, rough: .01, harmonics: [0, 1, .4, .28, .26, .08] },
  f1: { idle: 118, rev: 670, cutoff: 900, brightness: 1600, sub: .065, rough: .006, harmonics: [0, 1, .58, .32, .18, .12] },
} as const;

function glide(parameter: AudioParam, value: number, time: number, seconds: number) {
  parameter.cancelAndHoldAtTime(time);
  parameter.setTargetAtTime(value, time, seconds);
}

/** A single seated car, synthesized locally and connected to the existing soundscape master. */
export function createGarageAudio(context: BaseAudioContext, destination: AudioNode) {
  type Voice = { car: GarageEngineCar; update(throttle: number): void; release(): void; dispose(): void };
  let voice: Voice | undefined;
  let disposed = false;
  const fading = new Set<Voice>();
  const waves = new Map<GarageEngineCar, PeriodicWave>();
  let noise: AudioBuffer | undefined;

  function createVoice(car: GarageEngineCar): Voice {
    const profile = engines[car], now = context.currentTime;
    const envelope = context.createGain(); envelope.gain.value = 0; envelope.connect(destination);
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .55; filter.connect(envelope);
    const motor = context.createOscillator(), sub = context.createOscillator(), flutter = context.createOscillator();
    const subLevel = context.createGain(), flutterDepth = context.createGain(), textureLevel = context.createGain();
    const motorLevel = context.createGain(), combustionDepth = context.createGain();
    const exhaust = context.createBiquadFilter();
    exhaust.type = 'bandpass'; exhaust.frequency.value = car === 'f1' ? 820 : 310; exhaust.Q.value = .65;
    // Let firing pulses shape a broad exhaust texture instead of exposing a bare synthesizer note.
    motorLevel.gain.value = .28;
    combustionDepth.gain.value = .12;
    subLevel.gain.value = profile.sub;
    flutterDepth.gain.value = profile.idle * profile.rough;
    textureLevel.gain.value = .22;
    if (!waves.has(car)) {
      waves.set(car, context.createPeriodicWave(new Float32Array(profile.harmonics.length), Float32Array.from(profile.harmonics)));
    }
    motor.setPeriodicWave(waves.get(car)!);
    motor.frequency.value = profile.idle; motor.connect(motorLevel).connect(filter);
    motor.connect(combustionDepth).connect(textureLevel.gain);
    sub.type = 'triangle'; sub.frequency.value = profile.idle / 2; sub.connect(subLevel).connect(filter);
    flutter.type = 'sine'; flutter.frequency.value = 3.7; flutter.connect(flutterDepth).connect(motor.frequency);
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0); let seed = 9173, low = 0;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; low = .82 * low + .18 * (seed / 2147483648); data[i] = low * 2.4; }
    }
    const texture = context.createBufferSource(); texture.buffer = noise; texture.loop = true; texture.connect(exhaust).connect(textureLevel).connect(filter);
    const sources = [motor, sub, flutter, texture];
    const nodes: AudioNode[] = [...sources, envelope, filter, subLevel, flutterDepth, textureLevel, motorLevel, combustionDepth, exhaust];
    let released = false, cleaned = false, nextUpdateAt = -Infinity, previousThrottle = 0;
    function cleanup() {
      if (cleaned) return;
      cleaned = true; nodes.forEach(node => node.disconnect()); fading.delete(result);
    }
    motor.onended = cleanup;
    sources.forEach(source => source.start(now));
    const result: Voice = {
      car,
      update(throttle) {
        const t = context.currentTime;
        if (released || t < nextUpdateAt) return;
        nextUpdateAt = t + 1 / 30;
        const rpm = profile.idle + (profile.rev - profile.idle) * throttle;
        const response = throttle > previousThrottle ? .24 : .42;
        previousThrottle = throttle;
        glide(motor.frequency, rpm, t, response);
        glide(sub.frequency, rpm / 2, t, response);
        glide(flutter.frequency, 3.7 + throttle * 2.1, t, .12);
        glide(flutterDepth.gain, rpm * profile.rough * (1 - throttle * .65), t, .12);
        glide(filter.frequency, profile.cutoff + throttle * profile.brightness, t, .12);
        glide(textureLevel.gain, .22 + throttle * .26, t, .18);
        glide(combustionDepth.gain, .12 + throttle * .16, t, .18);
        glide(exhaust.frequency, (car === 'f1' ? 820 : 310) + throttle * 260, t, .24);
        // Quiet idle, fuller under load, with enough headroom for music and room effects.
        glide(envelope.gain, .025 + throttle * .05, t, .12);
      },
      release() {
        if (released) return;
        released = true; fading.add(result);
        glide(envelope.gain, 0, context.currentTime, .025);
        sources.forEach(source => source.stop(context.currentTime + .15));
      },
      dispose() {
        if (cleaned) return;
        released = true;
        sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } });
        cleanup();
      },
    };
    return result;
  }

  return {
    update(next: GarageEngineState | undefined) {
      if (disposed) return;
      if (!next || !Object.hasOwn(engines, next.car)) { voice?.release(); voice = undefined; return; }
      if (voice?.car !== next.car) {
        // Even rapid seat changes retain at most one fading voice plus the new engine.
        for (const old of fading) old.dispose();
        voice?.release(); voice = createVoice(next.car);
      }
      const throttle = Math.max(0, Math.min(1, Number.isFinite(next.throttle) ? next.throttle : 0));
      voice.update(throttle);
    },
    dispose() {
      if (disposed) return;
      disposed = true; voice?.dispose(); voice = undefined;
      for (const old of fading) old.dispose();
      fading.clear(); waves.clear(); noise = undefined;
    },
  };
}
