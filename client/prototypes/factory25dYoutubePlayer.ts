import type { RadioState } from '@shared/lounge-radio';
interface Player {
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  playVideo(): void; pauseVideo(): void; setVolume(volume: number): void;
  getCurrentTime(): number; seekTo(seconds: number, allowSeekAhead: boolean): void; getDuration(): number; getVideoData(): { video_id?: string } | undefined; destroy(): void;
}
interface Youtube { Player: new (element: HTMLElement, options: object) => Player }
declare global { interface Window { YT?: Youtube; onYouTubeIframeAPIReady?: () => void } }
let api: Promise<Youtube> | undefined;
function youtubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return api ??= new Promise<Youtube>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const cleanup = () => { clearTimeout(timeout); if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = previous; };
    const onReady = () => { cleanup(); previous?.(); if (window.YT) resolve(window.YT); };
    const timeout = window.setTimeout(() => { cleanup(); script.remove(); api = undefined; reject(new Error('YouTube took too long to load.')); }, 15000);
    window.onYouTubeIframeAPIReady = onReady;
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { cleanup(); api = undefined; script.remove(); reject(new Error('YouTube could not load.')); };
    document.head.append(script);
  });
}
/** Keep the same official iframe alive when the room's optional controls collapse. */
export function createYoutubePlayer(host: HTMLElement, callbacks: {
  preferences(): { enabled: boolean; volume: number }; enable(): void;
  background?: boolean;
  duration(id: number, seconds: number): void; feedback(message: string): void; playback?(playing: boolean): void;
}) {
  let generation = 0;
  let player: Player | undefined, state: RadioState | undefined, offset = 0;
  let disposed = false, ready = false, loading = false, loadedId = -1, reported = -1, reportedAt = 0;
  let consent = false, shown = false, wasAllowed = false, lastVolume = -1;
  let inView = true, isPlaying = false, audible = false, resumeOnShow = false, retryOnGesture = false;
  let nextSyncAt = 0, scratchUntil = 0;
  const retryDelays = [2000, 5000, 15000];
  let wantsPlayback = false, retryAt = 0, retries = 0, stalledAt: number | undefined;
  let loadingEntry = false;
  let recoveryEntry = -1, disconnected = false;
  const presentationAllowsPlayback = () => shown && (callbacks.background || inView);
  const sharedTime = () => Math.max(0, (Date.now() + offset - (state?.current?.startedAt ?? Date.now())) / 1000);
  function clearRecovery() { retryAt = 0; retries = 0; stalledAt = undefined; }
  function scheduleRecovery() {
    if (disposed || !wantsPlayback || retryOnGesture || retryAt !== 0) return;
    stalledAt = undefined;
    if (retries >= retryDelays.length) {
      retryAt = -1;
      callbacks.feedback('Music could not reconnect. Press play to retry.');
      return;
    }
    retryAt = Date.now() + retryDelays[retries];
    callbacks.feedback('Reconnecting music…');
  }
  function destroyPlayer() {
    generation++; player?.destroy(); player = undefined; host.replaceChildren();
    ready = false; loading = false; loadedId = -1; lastVolume = -1; wasAllowed = false; isPlaying = false;
    scratchUntil = 0; stalledAt = undefined; loadingEntry = false; publishPlayback();
  }
  function publishPlayback() {
    const prefs = callbacks.preferences();
    const next = isPlaying && presentationAllowsPlayback() && !document.hidden && prefs.enabled && prefs.volume > 0 && !!state?.current;
    if (next !== audible) { audible = next; callbacks.playback?.(next); }
  }
  const observer = new IntersectionObserver(entries => { inView = entries[0]?.intersectionRatio >= .95; tick(); }, { threshold: [0, .95, 1] });
  observer.observe(host);
  function reportDuration() {
    const current = state?.current;
    if (!ready || !current || current.durationKnown || (reported === current.id && Date.now() - reportedAt < 15000) || player?.getVideoData()?.video_id !== current.videoId) return;
    const seconds = player.getDuration();
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 10800) { reported = current.id; reportedAt = Date.now(); callbacks.duration(current.id, seconds); }
  }
  function tick() {
    if (disposed) return;
    publishPlayback();
    const preferences = callbacks.preferences();
    const allowed = presentationAllowsPlayback() && !document.hidden && preferences.enabled && consent && wantsPlayback;
    const current = state?.current;
    if (allowed && preferences.volume > 0 && current && !retryOnGesture) {
      if (stalledAt !== undefined && Date.now() - stalledAt >= 15000) scheduleRecovery();
      if (retryAt > 0 && Date.now() >= retryAt) {
        retryAt = 0; retries++; destroyPlayer(); resumeOnShow = true;
        void open(); return;
      }
    } else if (stalledAt !== undefined) stalledAt = Date.now();
    if (!ready || !player) return;
    if (current && loadedId !== current.id && shown) {
      loadedId = current.id;
      const options = { videoId: current.videoId, startSeconds: sharedTime() };
      loadingEntry = allowed;
      if (allowed) player.loadVideoById(options); else player.cueVideoById(options);
      if (allowed) stalledAt = Date.now();
    }
    if (!allowed && wasAllowed) { resumeOnShow = resumeOnShow || wantsPlayback; player.pauseVideo(); }
    if (!current) player.pauseVideo();
    if (allowed && resumeOnShow) {
      resumeOnShow = false;
      if (current) player.seekTo(sharedTime(), true);
      player.playVideo();
      stalledAt = Date.now();
    }
    if (scratchUntil && Date.now() >= scratchUntil) {
      scratchUntil = 0;
      if (allowed && isPlaying && current) player.seekTo(sharedTime(), true);
    }
    // Rejoin the shared broadcast after a pause and correct meaningful buffering drift.
    if (allowed && isPlaying && current && !scratchUntil && Date.now() >= nextSyncAt) {
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
        videoId: state?.current?.videoId,
        width: '100%', height: '100%', playerVars: { playsinline: 1, origin: location.origin },
        events: {
          onReady: () => { if (generation !== currentGeneration) return; ready = true; stalledAt = undefined; tick(); },
          onStateChange: (event: { data: number }) => {
            if (generation !== currentGeneration) return;
            isPlaying = event.data === 1;
            publishPlayback();
            if (event.data === 1) {
              loadingEntry = false;
              if (!presentationAllowsPlayback() || document.hidden) { player?.pauseVideo?.(); return; }
              if (!consent) callbacks.enable();
              else if (!callbacks.preferences().enabled) { player?.pauseVideo(); return; }
              consent = true; wasAllowed = true; retryOnGesture = false;
              wantsPlayback = true; clearRecovery();
              lastVolume = Math.round(callbacks.preferences().volume); player?.setVolume(lastVolume);
              callbacks.feedback(''); reportDuration(); publishPlayback();
            }
            if (event.data === 3 && wantsPlayback && stalledAt === undefined) stalledAt = Date.now();
            // Loading another entry can pause the old video before playback starts.
            // Once it starts, YouTube's own pause control is the listener's choice.
            if (event.data === 2 && !loadingEntry) {
              stalledAt = undefined;
              if (presentationAllowsPlayback() && !document.hidden && callbacks.preferences().enabled && state?.current && !resumeOnShow && !retryOnGesture && retryAt === 0) wantsPlayback = false;
            }
            if (event.data === 0 && !loadingEntry) stalledAt = undefined;
          },
          onAutoplayBlocked: () => {
            // This callback can arrive after a pause or after another entry loads.
            if (generation !== currentGeneration || !wantsPlayback || !state?.current
              || loadedId !== state.current.id || isPlaying && !loadingEntry) return;
            const videoId = player?.getVideoData()?.video_id;
            if (videoId && videoId !== state.current.videoId) return;
            retryOnGesture = true; retryAt = 0; stalledAt = undefined;
            callbacks.feedback('Click in the room to join the DJ, or press play in the video.');
          },
          onError: (event?: { data: number }) => {
            if (generation !== currentGeneration) return;
            isPlaying = false; loadingEntry = false; publishPlayback();
            if ([2, 100, 101, 150, 153].includes(event?.data ?? 0)) {
              retryAt = -1; stalledAt = undefined;
              callbacks.feedback('This video cannot play here. Choose another song from the shared queue.');
            } else scheduleRecovery();
          },
        },
      });
      stalledAt = Date.now();
    } catch (error) {
      if (disposed || generation !== currentGeneration) return;
      callbacks.feedback(error instanceof Error ? error.message : 'YouTube could not load.'); scheduleRecovery();
    }
    finally { if (generation === currentGeneration) loading = false; }
  }
  const onVisibility = () => { if (document.hidden) { resumeOnShow = resumeOnShow || wantsPlayback; player?.pauseVideo?.(); wasAllowed = false; } tick(); };
  document.addEventListener('visibilitychange', onVisibility);
  const onGesture = () => {
    if (!retryOnGesture || !shown || !callbacks.preferences().enabled) return;
    retryOnGesture = false; wantsPlayback = true; resumeOnShow = true; clearRecovery(); tick();
  };
  document.addEventListener('pointerdown', onGesture);
  document.addEventListener('keydown', onGesture);
  return {
    open,
    scratch(entryId: number, amount: number) {
      if (!ready || !player || !isPlaying || !wasAllowed || state?.current?.id !== entryId) return;
      player.seekTo(Math.max(0, sharedTime() + amount), true);
      scratchUntil = amount === 0 ? 0 : Date.now() + 300;
    },
    join() { consent = true; wantsPlayback = true; resumeOnShow = true; clearRecovery(); callbacks.enable(); return open(); },
    reset() {
      resumeOnShow = wantsPlayback; clearRecovery(); destroyPlayer(); callbacks.feedback('');
    },
    pause() { retryOnGesture = false; wantsPlayback = false; resumeOnShow = false; loadingEntry = false; clearRecovery(); player?.pauseVideo?.(); isPlaying = false; publishPlayback(); },
    seek(seconds: number) { if(ready && Number.isFinite(seconds)) player?.seekTo(Math.max(0, Math.min(player.getDuration(), seconds)), true); },
    progress() { return {ready, playing:isPlaying, time:ready ? player?.getCurrentTime() ?? 0 : 0, duration:ready ? player?.getDuration() ?? 0 : 0}; },
    play() { consent = true; wantsPlayback = true; resumeOnShow = true; retryOnGesture = false; const failed = retryAt !== 0; clearRecovery(); callbacks.enable(); if (failed) destroyPlayer(); if (!player) void open(); else tick(); },
    hide() { resumeOnShow = resumeOnShow || wantsPlayback; shown = false; publishPlayback(); player?.pauseVideo?.(); wasAllowed = false; },
    update(next: RadioState | undefined) {
      if (!next) disconnected = true;
      if (state !== next) {
        state = next; offset = next ? next.serverTime - Date.now() : 0;
        if (next?.current) {
          if (next.current.id !== recoveryEntry) {
            recoveryEntry = next.current.id; clearRecovery(); retryOnGesture = false;
            if (shown && !player && !loading) scheduleRecovery();
          }
          if (disconnected && wantsPlayback) resumeOnShow = true;
          disconnected = false;
        }
      }
      tick();
    },
    dispose() { shown = false; publishPlayback(); disposed = true; generation++; observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('pointerdown', onGesture); document.removeEventListener('keydown', onGesture); player?.destroy(); },
  };
}
