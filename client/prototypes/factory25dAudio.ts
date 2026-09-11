import { rememberVolume } from './factory25dVolumeMemory';
import { requireElement } from './dom';
import { CLEAR_WEATHER } from '../sky/weather';
import { createSoundscape, loadSoundscapeSamples, type SoundEnvironment } from './factory25dSoundscape';
import { createGarageAudio, type GarageEngineState } from './factory25dGarageAudio';

/** One opt-in mixer owns every sound, including the arcade effects. */
export function createFactoryAudio() {
  const toggle = requireElement<HTMLButtonElement>('#scene-sound-toggle');
  const slider = requireElement<HTMLInputElement>('#scene-volume');
  const level = requireElement<HTMLElement>('#scene-sound-level');
  const output = requireElement<HTMLOutputElement>('#scene-volume-value');
  const status = requireElement<HTMLElement>('#scene-sound-status');
  const musicSlider = document.querySelector<HTMLInputElement>('#scene-music-volume');
  const musicOutput = document.querySelector<HTMLOutputElement>('#scene-music-value');
  let musicVolume = 40;
  try { const saved = localStorage.getItem('factory-music-level-v2'); if (saved !== null && Number.isFinite(Number(saved))) musicVolume = Math.max(0, Math.min(100, Number(saved))); } catch {}
  let analyser: AnalyserNode | undefined;
  const meterSamples = new Uint8Array(128);
  let context: AudioContext | undefined;
  let graph: ReturnType<typeof createSoundscape> | undefined;
  let garage: ReturnType<typeof createGarageAudio> | undefined;
  let samples: ReturnType<typeof loadSoundscapeSamples> | undefined;
  let assetAbort: AbortController | undefined;
  let request = 0;
  let enabled = false;
  let disposed = false;
  let volume = 40;
  let pauseTimer = 0;
  let nextBirdAt = Infinity;
  let wasFair = false;
  let nextUpdateAt = 0;
  let environment: SoundEnvironment = {
    weather: CLEAR_WEATHER, patio01: 0, window01: 0, night: false, reading: false,
  };
  try {
    const saved = localStorage.getItem('factory-ambient-volume-v1');
    if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(100, Number(saved)));
  } catch { /* Volume works without storage. */ }

  function paint() {
    toggle.textContent = enabled ? (graph ? 'sound on' : 'loading sound') : 'sound off';
    toggle.setAttribute('aria-pressed', String(enabled));
    level.hidden = false;
    if (musicSlider) musicSlider.value = String(musicVolume);
    if (musicOutput) musicOutput.value = `${musicVolume}%`;
    slider.value = String(volume);
    slider.setAttribute('aria-valuetext', `${volume}%`);
    output.value = `${volume}%`;

  }

  async function syncPlayback() {
    const currentRequest = ++request;
    clearTimeout(pauseTimer);
    nextBirdAt = Infinity;
    wasFair = false;
    if (!enabled || document.hidden || disposed) {

      garage?.update(undefined);
      graph?.stopThunder();
      graph?.stopPropSounds();
      graph?.setVolume(0, 0.025);
      pauseTimer = window.setTimeout(() => {
        if ((!enabled || document.hidden) && context?.state === 'running') void context.suspend().catch(() => {});
      }, 180);
      return;
    }
    try {
      context ??= new AudioContext();
      // Resume in the gesture before fetching; never rely on autoplay after an await.
      await context.resume();
      if (!samples) {
        assetAbort = new AbortController();
        const timeout = window.setTimeout(() => assetAbort?.abort(), 15000);
        samples = loadSoundscapeSamples(context, assetAbort.signal)
          .finally(() => clearTimeout(timeout))
          .catch(error => { samples = undefined; throw error; });
      }
      const recordings = await samples;
      if (!enabled || document.hidden || disposed || currentRequest !== request) return;
      graph ??= createSoundscape(context, recordings);
      if (!analyser && context.createAnalyser) { analyser = context.createAnalyser(); analyser.fftSize = 256; graph.input.connect(analyser); }
      graph.update(environment);
      graph.setVolume(volume, 0.4);
      status.textContent = '';
      paint();
    } catch {
      if (disposed || currentRequest !== request) return;
      enabled = false;

      garage?.update(undefined);
      graph?.stopPropSounds();
      graph?.setVolume(0);
      void context?.suspend().catch(() => {});
      status.textContent = 'Sound could not start. Tap sound to try again.';
      paint();
    }
  }

  const onToggle = () => {
    enabled = !enabled;
    paint();
    void syncPlayback();
  };
  const onVolume = () => {
    volume = Number(slider.value);
    rememberVolume('factory-ambient-volume-v1',volume,localStorage);
    if (volume <= 0) {  garage?.update(undefined); graph?.stopThunder(); graph?.stopPropSounds(); }
    if (enabled && !document.hidden) graph?.setVolume(volume);
    try { localStorage.setItem('factory-ambient-volume-v1', String(volume)); } catch { /* Optional. */ }
    paint();
  };
  const onVisibility = () => { void syncPlayback(); };
  toggle.addEventListener('click', onToggle);
  slider.addEventListener('input', onVolume);
  const onMusicVolume = () => { musicVolume = Number(musicSlider!.value); rememberVolume('factory-music-level-v2',musicVolume,localStorage); try { localStorage.setItem('factory-music-level-v2', String(musicVolume)); } catch {} paint(); };
  musicSlider?.addEventListener('input', onMusicVolume);
  document.addEventListener('visibilitychange', onVisibility);
  paint();
  const propsAudible = () => !disposed && enabled && volume > 0 && !document.hidden && context?.state === 'running' && !!graph;

  return {
    musicPreferences() { return { enabled: !disposed && enabled && !document.hidden, volume: musicVolume }; },
    enableMusic() { if (!enabled) { enabled = true; paint(); void syncPlayback(); } },
    vendingSelect() { if (propsAudible()) graph!.vendingSelect(); },
    vendingDispense() { if (propsAudible()) graph!.vendingDispense(); },
    vendingLand(energy = 1) { if (propsAudible()) graph!.vendingLand(energy); },
    lampSwitch(on = true) { if (propsAudible()) graph!.lampSwitch(on); },
    candle(on: boolean) { if (propsAudible()) graph!.candle(on); },
    phoneBuzz() { if (propsAudible()) graph!.phoneBuzz(); },
    stopPhoneBuzz() { graph?.stopPhoneBuzz(); },
    stopPropSounds() { graph?.stopPropSounds(); },
    thunder(energy = 1, pan = 0) {
      if (!disposed && enabled && volume > 0 && !document.hidden && context?.state === 'running') graph?.thunder(energy, pan);
    },
    garageEngine(next: GarageEngineState | undefined) {
      if (!next || disposed || !enabled || volume <= 0 || document.hidden || context?.state !== 'running' || !graph) {
        garage?.update(undefined); return;
      }
      garage ??= createGarageAudio(context, graph.input);
      garage.update(next);
    },
    update(next: SoundEnvironment) {
      environment = next;
      if (!enabled || document.hidden || context?.state !== 'running' || !graph) return;
      const now = context.currentTime;
      if (now < nextUpdateAt) return;
      nextUpdateAt = now + 0.1;
      if (analyser) { analyser.getByteFrequencyData(meterSamples); const host = toggle.closest<HTMLElement>('.scene-sound'); if (host) host.dataset.sfxLevel = String(Math.min(1, Math.max(...meterSamples)/150)); }
      const fair = graph.update(environment).birds > 0;
      if (fair && !wasFair) nextBirdAt = now + 8 + Math.random() * 14;
      if (!fair) nextBirdAt = Infinity;
      wasFair = fair;
      if (now >= nextBirdAt && volume > 0) {
        graph.bird();
        nextBirdAt = now + 18 + Math.random() * 25;
      }
    },
    ballTap() {
      if (enabled && volume > 0 && !document.hidden && context?.state === 'running') graph?.ballTap();
    },
    ballSwish() {
      if (enabled && volume > 0 && !document.hidden && context?.state === 'running') graph?.ballSwish();
    },
    ballBounce(energy = 1) {
      if (enabled && volume > 0 && !document.hidden && context?.state === 'running') graph?.ballBounce(energy);
    },
    dispose() {
      disposed = true;
      request++;
      assetAbort?.abort();
      clearTimeout(pauseTimer);
      toggle.removeEventListener('click', onToggle);
      slider.removeEventListener('input', onVolume);
      musicSlider?.removeEventListener('input', onMusicVolume);
      document.removeEventListener('visibilitychange', onVisibility);
      garage?.dispose();
      graph?.dispose();
      void context?.close().catch(() => {});
    },
  };
}
