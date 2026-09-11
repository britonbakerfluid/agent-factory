import { afterEach, expect, it, vi } from 'vitest';
import { createYoutubePlayer } from '../client/prototypes/factory25dYoutubePlayer';
import { LoungeRadioQueue, DJ_VIDEOS } from '../shared/lounge-radio';
afterEach(() => { vi.unstubAllGlobals(); });
it('cues without autoplay, switches the displayed video, pauses hidden/offscreen, and respects local volume', async () => {
  let events: any, intersection: (entries: any[]) => void;
  let enabled = false, videoId = '', volume = 22;
  const instance = {
    cueVideoById: vi.fn((v: any) => { videoId = v.videoId; }), loadVideoById: vi.fn((v: any) => { videoId = v.videoId; }),
    playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), getCurrentTime: () => 12, seekTo: vi.fn(), getDuration: () => 123,
    getVideoData: () => ({video_id:videoId}), destroy: vi.fn(),
  };
  vi.stubGlobal('window', { YT: { Player: class { constructor(_element: any, options: any) { events = options.events; return instance; } } } });
  const document = Object.assign(new EventTarget(), { hidden:false, createElement: () => ({}) });
  vi.stubGlobal('document', document); vi.stubGlobal('location', {origin:'http://localhost:5173'});
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { intersection=cb; } observe() {} disconnect() {} });
  const host = { append: vi.fn(), replaceChildren: vi.fn() } as unknown as HTMLElement;
  const duration=vi.fn(), playback=vi.fn();
  const player=createYoutubePlayer(host,{preferences:()=>({enabled,volume}),enable:()=>{enabled=true;},duration,playback,feedback:vi.fn()});
  const queue=new LoungeRadioQueue(); const first=queue.snapshot(Date.now());
  player.update(first); expect(host.append).not.toHaveBeenCalled();
  await player.open(); events.onReady();
  expect(instance.cueVideoById).toHaveBeenCalledOnce(); expect(instance.loadVideoById).not.toHaveBeenCalled();
  player.play(); expect(enabled).toBe(true); expect(instance.playVideo).toHaveBeenCalledOnce();
  expect(playback).not.toHaveBeenCalled();
  events.onStateChange({data:1}); expect(playback).toHaveBeenLastCalledWith(true);
  events.onStateChange({data:2}); expect(playback).toHaveBeenLastCalledWith(false);
  events.onStateChange({data:1}); expect(playback).toHaveBeenLastCalledWith(true);
  queue.enqueue(DJ_VIDEOS[1].videoId,'Alice',Date.now());player.update(queue.snapshot(Date.now()));
  expect(instance.loadVideoById.mock.lastCall?.[0].videoId).toBe(DJ_VIDEOS[1].videoId);
  expect(duration).toHaveBeenCalledWith(queue.snapshot(Date.now()).current!.id,123);
  volume=0;player.update(queue.snapshot(Date.now()));expect(instance.setVolume).toHaveBeenLastCalledWith(0);expect(playback).toHaveBeenLastCalledWith(false);
  intersection!([{intersectionRatio:0}]);expect(instance.pauseVideo).toHaveBeenCalled();
  instance.pauseVideo.mockClear();intersection!([{intersectionRatio:1}]);document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  expect(instance.pauseVideo).toHaveBeenCalled();
  document.hidden=false;enabled=false;events.onStateChange({data:1});expect(enabled).toBe(false);
  enabled=true; events.onStateChange({data:1});
  player.hide(); events.onStateChange({data:2}); instance.playVideo.mockClear();
  await player.open(); expect(instance.playVideo).toHaveBeenCalledOnce();
  player.pause(); player.hide(); instance.playVideo.mockClear();
  await player.open(); expect(instance.playVideo).not.toHaveBeenCalled();
  for (let cycle = 0; cycle < 20; cycle++) {
    player.play(); events.onStateChange({data:1}); player.hide(); events.onStateChange({data:2});
    instance.playVideo.mockClear(); await player.open(); expect(instance.playVideo).toHaveBeenCalledOnce();
    player.seek(999); expect(instance.seekTo).toHaveBeenLastCalledWith(123, true);
    const staleEvents = events; player.reset();
    expect(player.progress().ready).toBe(false);
    staleEvents.onReady(); expect(player.progress().ready).toBe(false);
    await player.open(); events.onReady(); expect(player.progress().ready).toBe(true);
    events.onStateChange({data:1}); events.onError(); expect(player.progress().playing).toBe(false);
  }
  player.dispose();expect(instance.destroy).toHaveBeenCalledTimes(21);
});
