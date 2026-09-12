import type { RadioState } from '@shared/lounge-radio';
interface Player {
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  playVideo(): void; pauseVideo(): void; setVolume(volume: number): void;
  getCurrentTime(): number; seekTo(seconds: number, allowSeekAhead: boolean): void; getDuration(): number; getVideoData(): { video_id?: string }; destroy(): void;
}
interface Youtube { Player: new (element: HTMLElement, options: object) => Player }
declare global { interface Window { YT?: Youtube; onYouTubeIframeAPIReady?: () => void } }
let api: Promise<Youtube> | undefined;
function youtubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return api ??= new Promise<Youtube>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => { api = undefined; reject(new Error('YouTube took too long to load. Close the radio and try again.')); }, 15000);
    window.onYouTubeIframeAPIReady = () => { previous?.(); clearTimeout(timeout); if (window.YT) resolve(window.YT); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); api = undefined; script.remove(); reject(new Error('YouTube could not load. Check your connection.')); };
    document.head.append(script);
  });
}
/** Playback is only allowed in a visible, on-screen official player. No extracted audio. */
export function createYoutubePlayer(host: HTMLElement, callbacks: {
  preferences(): { enabled: boolean; volume: number }; enable(): void;
  duration(id: number, seconds: number): void; feedback(message: string): void; playback?(playing: boolean): void;
}) {
  let generation = 0;
  let player: Player | undefined, state: RadioState | undefined, offset = 0;
  let disposed = false, ready = false, loading = false, loadedId = -1, reported = -1, reportedAt = 0;
  let consent = false, shown = false, wasAllowed = false, lastVolume = -1;
  let inView = true, isPlaying = false, audible = false, resumeOnShow = false, retryOnGesture = false;
  let nextSyncAt = 0;
  const sharedTime = () => Math.max(0, (Date.now() + offset - (state?.current?.startedAt ?? Date.now())) / 1000);
  function publishPlayback() {
    const prefs = callbacks.preferences();
    const next = isPlaying && shown && inView && !document.hidden && prefs.enabled && prefs.volume > 0 && !!state?.current;
    if (next !== audible) { audible = next; callbacks.playback?.(next); }
  }
  const observer = new IntersectionObserver(entries => { inView = entries[0]?.intersectionRatio >= .95; tick(); }, { threshold: [0, .95, 1] });
  observer.observe(host);
  function reportDuration() {
    const current = state?.current;
    if (!ready || !current || current.durationKnown || (reported === current.id && Date.now() - reportedAt < 15000) || player?.getVideoData().video_id !== current.videoId) return;
    const seconds = player.getDuration();
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 10800) { reported = current.id; reportedAt = Date.now(); callbacks.duration(current.id, seconds); }
  }
  function tick() {
    publishPlayback();
    if (!ready || !player) return;
    const preferences = callbacks.preferences();
    const allowed = shown && inView && !document.hidden && preferences.enabled && consent;
    const current = state?.current;
    if (current && loadedId !== current.id && shown) {
      loadedId = current.id;
      const options = { videoId: current.videoId, startSeconds: sharedTime() };
      if (allowed) player.loadVideoById(options); else player.cueVideoById(options);
    }
    if (!allowed && wasAllowed) { resumeOnShow = resumeOnShow || isPlaying; player.pauseVideo(); }
    if (!current) player.pauseVideo();
    if (allowed && resumeOnShow) {
      resumeOnShow = false;
      if (current) player.seekTo(sharedTime(), true);
      player.playVideo();
    }
    // Rejoin the shared broadcast after a pause and correct meaningful buffering drift.
    if (allowed && isPlaying && current && Date.now() >= nextSyncAt) {
      nextSyncAt = Date.now() + 10000;
      const target = sharedTime();
      if (Math.abs(player.getCurrentTime() - target) > 2.5) player.seekTo(target, true);
    }
    wasAllowed = allowed;
    const volume = Math.round(preferences.volume);
    if (lastVolume !== volume) { player.setVolume(volume); lastVolume = volume; }
    reportDuration();
  }
  async function open() {
    shown = true;
    if (player || loading || disposed) { tick(); return; }
    loading = true; const currentGeneration = generation;
    try {
      const YT = await youtubeApi();
      if (disposed || generation !== currentGeneration) return;
      const mount = document.createElement('div'); host.append(mount);
      player = new YT.Player(mount, {
        width: '100%', height: '100%', playerVars: { playsinline: 1, origin: location.origin },
        events: {
          onReady: () => { if (generation !== currentGeneration) return; ready = true; tick(); },
          onStateChange: (event: { data: number }) => {
            if (generation !== currentGeneration) return;
            isPlaying = event.data === 1;
            publishPlayback();
            if (event.data === 1) {
              if (!shown || !inView || document.hidden) { player?.pauseVideo(); return; }
              if (!consent) callbacks.enable();
              else if (!callbacks.preferences().enabled) { player?.pauseVideo(); return; }
              consent = true; wasAllowed = true; retryOnGesture = false; callbacks.feedback(''); reportDuration(); publishPlayback();
            }
          },
          onAutoplayBlocked: () => { retryOnGesture = true; callbacks.feedback('Click in the room to join the DJ, or press play in the video.'); },
          onError: () => { if (generation !== currentGeneration) return; isPlaying = false; publishPlayback(); callbacks.feedback('YouTube could not play this video. Retry or skip to the next track.'); },
        },
      });
    } catch (error) { callbacks.feedback(error instanceof Error ? error.message : 'YouTube could not load.'); }
    finally { if (generation === currentGeneration) loading = false; }
  }
  const onVisibility = () => { if (document.hidden) { resumeOnShow = resumeOnShow || isPlaying; player?.pauseVideo(); wasAllowed = false; } tick(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onGesture = () => {
    if (!retryOnGesture || !shown || !callbacks.preferences().enabled) return;
    retryOnGesture = false; resumeOnShow = true; tick();
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
  return {
    open,
    join() { consent = true; resumeOnShow = true; callbacks.enable(); return open(); },
    reset() {
      resumeOnShow = resumeOnShow || isPlaying; generation++; player?.destroy(); player = undefined;
      host.replaceChildren(); ready = false; loading = false; loadedId = -1; lastVolume = -1; wasAllowed = false; isPlaying = false; publishPlayback(); callbacks.feedback('');
    },
    pause() { retryOnGesture = false; resumeOnShow = false; player?.pauseVideo(); isPlaying = false; publishPlayback(); },
    seek(seconds: number) { if(ready && Number.isFinite(seconds)) player?.seekTo(Math.max(0, Math.min(player.getDuration(), seconds)), true); },
    progress() { return {ready, playing:isPlaying, time:ready ? player?.getCurrentTime() ?? 0 : 0, duration:ready ? player?.getDuration() ?? 0 : 0}; },
    play() { consent = true; resumeOnShow = true; callbacks.enable(); tick(); },
    hide() { resumeOnShow = resumeOnShow || isPlaying; shown = false; publishPlayback(); player?.pauseVideo(); wasAllowed = false; },
    update(next: RadioState | undefined) { if (state !== next) { state = next; offset = next ? next.serverTime - Date.now() : 0; } tick(); },
    dispose() { shown = false; publishPlayback(); disposed = true; generation++; observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('pointerdown', onGesture); document.removeEventListener('keydown', onGesture); player?.destroy(); },
  };
}
