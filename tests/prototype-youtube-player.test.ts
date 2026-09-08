import { afterEach, expect, it, vi } from 'vitest';
import { createYoutubePlayer } from '../client/prototypes/factory25dYoutubePlayer';
import { LoungeRadioQueue, DJ_VIDEOS } from '../shared/lounge-radio';
afterEach(() => { vi.unstubAllGlobals(); });
it('cues without autoplay, switches the displayed video, pauses hidden/offscreen, and respects local volume', async () => {
  let events: any, intersection: (entries: any[]) => void;
  let enabled = false, videoId = '', volume = 22;
  const instance = {
    cueVideoById: vi.fn((v: any) => { videoId = v.videoId; }), loadVideoById: vi.fn((v: any) => { videoId = v.videoId; }),
    playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), getDuration: () => 123,
    getVideoData: () => ({video_id:videoId}), destroy: vi.fn(),
  };
  vi.stubGlobal('window', { YT: { Player: class { constructor(_element: any, options: any) { events = options.events; return instance; } } } });
  const document = Object.assign(new EventTarget(), { hidden:false, createElement: () => ({}) });
  vi.stubGlobal('document', document); vi.stubGlobal('location', {origin:'http://localhost:5173'});
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { intersection=cb; } observe() {} disconnect() {} });
  const host = { append: vi.fn() } as unknown as HTMLElement;
  const duration=vi.fn();
  const player=createYoutubePlayer(host,{preferences:()=>({enabled,volume}),enable:()=>{enabled=true;},duration,feedback:vi.fn()});
  const queue=new LoungeRadioQueue(); const first=queue.snapshot(Date.now());
  player.update(first); expect(host.append).not.toHaveBeenCalled();
  await player.open(); events.onReady();
  expect(instance.cueVideoById).toHaveBeenCalledOnce(); expect(instance.loadVideoById).not.toHaveBeenCalled();
  player.play(); expect(enabled).toBe(true); expect(instance.playVideo).toHaveBeenCalledOnce();
  queue.enqueue(DJ_VIDEOS[1].videoId,'Alice',Date.now());player.update(queue.snapshot(Date.now()));
  expect(instance.loadVideoById.mock.lastCall?.[0].videoId).toBe(DJ_VIDEOS[1].videoId);
  expect(duration).toHaveBeenCalledWith(queue.snapshot(Date.now()).current!.id,123);
  volume=0;player.update(queue.snapshot(Date.now()));expect(instance.setVolume).toHaveBeenLastCalledWith(0);
  intersection!([{intersectionRatio:0}]);expect(instance.pauseVideo).toHaveBeenCalled();
  instance.pauseVideo.mockClear();intersection!([{intersectionRatio:1}]);document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  expect(instance.pauseVideo).toHaveBeenCalled();
  document.hidden=false;enabled=false;events.onStateChange({data:1});expect(enabled).toBe(false);
  player.hide();player.dispose();expect(instance.destroy).toHaveBeenCalledOnce();
});
