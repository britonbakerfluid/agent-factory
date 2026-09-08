import type { RadioState } from '@shared/lounge-radio';
interface Player {
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  playVideo(): void; pauseVideo(): void; setVolume(volume: number): void;
  getDuration(): number; getVideoData(): { video_id?: string }; destroy(): void;
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
  duration(id: number, seconds: number): void; feedback(message: string): void;
}) {
  let player: Player | undefined, state: RadioState | undefined, offset = 0;
  let disposed = false, ready = false, loading = false, loadedId = -1, reported = -1, reportedAt = 0;
  let consent = false, shown = false, wasAllowed = false, lastVolume = -1;
  let inView = true;
  const observer = new IntersectionObserver(entries => { inView = entries[0]?.intersectionRatio >= .95; tick(); }, { threshold: [0, .95, 1] });
  observer.observe(host);
  function reportDuration() {
    const current = state?.current;
    if (!ready || !current || current.durationKnown || (reported === current.id && Date.now() - reportedAt < 15000) || player?.getVideoData().video_id !== current.videoId) return;
    const seconds = player.getDuration();
    if (Number.isFinite(seconds) && seconds >= 5 && seconds <= 10800) { reported = current.id; reportedAt = Date.now(); callbacks.duration(current.id, seconds); }
  }
  function tick() {
    if (!ready || !player) return;
    const preferences = callbacks.preferences();
    const allowed = shown && inView && !document.hidden && preferences.enabled && consent;
    const current = state?.current;
    if (current && loadedId !== current.id && shown) {
      loadedId = current.id;
      const options = { videoId: current.videoId, startSeconds: Math.max(0, (Date.now() + offset - current.startedAt) / 1000) };
      if (allowed) player.loadVideoById(options); else player.cueVideoById(options);
    }
    if (!allowed && wasAllowed) player.pauseVideo();
    if (!current) player.pauseVideo();
    wasAllowed = allowed;
    const volume = Math.round(preferences.volume);
    if (lastVolume !== volume) { player.setVolume(volume); lastVolume = volume; }
    reportDuration();
  }
  async function open() {
    shown = true;
    if (player || loading || disposed) { tick(); return; }
    loading = true;
    try {
      const YT = await youtubeApi();
      if (disposed) return;
      const mount = document.createElement('div'); host.append(mount);
      player = new YT.Player(mount, {
        width: '100%', height: '100%', playerVars: { playsinline: 1, origin: location.origin },
        events: {
          onReady: () => { ready = true; tick(); },
          onStateChange: (event: { data: number }) => {
            if (event.data === 1) {
              if (!shown || !inView || document.hidden) { player?.pauseVideo(); return; }
              if (!consent) callbacks.enable();
              else if (!callbacks.preferences().enabled) { player?.pauseVideo(); return; }
              consent = true; wasAllowed = true; callbacks.feedback(''); reportDuration();
            }
          },
          onAutoplayBlocked: () => callbacks.feedback('Tap play in the video to listen.'),
          onError: () => callbacks.feedback('YouTube cannot play this video here. Try another link or skip it.'),
        },
      });
    } catch (error) { callbacks.feedback(error instanceof Error ? error.message : 'YouTube could not load.'); }
    finally { loading = false; }
  }
  const onVisibility = () => { if (document.hidden) { player?.pauseVideo(); wasAllowed = false; } tick(); };
  document.addEventListener('visibilitychange', onVisibility);
  return {
    open,
    play() { consent = true; callbacks.enable(); tick(); player?.playVideo(); },
    hide() { shown = false; player?.pauseVideo(); wasAllowed = false; },
    update(next: RadioState | undefined) { if (state !== next) { state = next; offset = next ? next.serverTime - Date.now() : 0; } tick(); },
    dispose() { disposed = true; observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); player?.destroy(); },
  };
}
