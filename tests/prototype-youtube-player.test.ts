import { afterEach, expect, it, vi } from 'vitest';
import { createYoutubePlayer } from '../client/prototypes/factory25dYoutubePlayer';
import { LoungeRadioQueue, DJ_VIDEOS } from '../shared/lounge-radio';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('cues without autoplay, switches the displayed video, pauses hidden/offscreen, and respects local volume', async () => {
  let created = 0;
  let events: any, intersection: (entries: any[]) => void;
  let enabled = false, videoId = '', volume = 22;
  const instance = {
    cueVideoById: vi.fn((v: any) => { videoId = v.videoId; }), loadVideoById: vi.fn((v: any) => { videoId = v.videoId; }),
    playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), getCurrentTime: () => 12, seekTo: vi.fn(), getDuration: () => 123,
    getVideoData: vi.fn(() => ({video_id:videoId}) as {video_id?: string} | undefined), destroy: vi.fn(),
  };
  vi.stubGlobal('window', { YT: { Player: class { constructor(_element: any, options: any) { created++; events = options.events; return instance; } } } });
  const document = Object.assign(new EventTarget(), { hidden:false, createElement: () => ({}) });
  vi.stubGlobal('document', document); vi.stubGlobal('location', {origin:'http://localhost:5173'});
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: any) { intersection=cb; } observe() {} disconnect() {} });
  const host = { append: vi.fn(), replaceChildren: vi.fn() } as unknown as HTMLElement;
  const duration=vi.fn(), playback=vi.fn();
  const player=createYoutubePlayer(host,{preferences:()=>({enabled,volume}),enable:()=>{enabled=true;},duration,playback,feedback:vi.fn()});
  const queue=new LoungeRadioQueue(); const first=queue.snapshot(Date.now());
  player.update(first); expect(host.append).not.toHaveBeenCalled();
  await player.open(); instance.getVideoData.mockReturnValueOnce(undefined); expect(() => events.onReady()).not.toThrow();
  expect(instance.cueVideoById).toHaveBeenCalledOnce(); expect(instance.loadVideoById).not.toHaveBeenCalled();
  player.play(); expect(enabled).toBe(true); expect(instance.playVideo).toHaveBeenCalledOnce();
  expect(playback).not.toHaveBeenCalled();
  events.onStateChange({data:1}); expect(playback).toHaveBeenLastCalledWith(true);
  events.onStateChange({data:2}); expect(playback).toHaveBeenLastCalledWith(false);
  events.onStateChange({data:1}); expect(playback).toHaveBeenLastCalledWith(true);
  enabled=false;player.update(first);events.onStateChange({data:2});instance.playVideo.mockClear();
  enabled=true;player.update(first);expect(instance.playVideo).toHaveBeenCalledOnce();events.onStateChange({data:1});
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));events.onStateChange({data:2});instance.playVideo.mockClear();
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));expect(instance.playVideo).toHaveBeenCalledOnce();events.onStateChange({data:1});
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
    player.play(); await player.open(); events.onReady(); events.onStateChange({data:1}); player.hide(); events.onStateChange({data:2});
    instance.playVideo.mockClear(); await player.open(); expect(instance.playVideo).toHaveBeenCalledOnce();
    player.seek(999); expect(instance.seekTo).toHaveBeenLastCalledWith(123, true);
    const staleEvents = events; player.reset();
    expect(player.progress().ready).toBe(false);
    staleEvents.onReady(); expect(player.progress().ready).toBe(false);
    await player.open(); events.onReady(); expect(player.progress().ready).toBe(true);
    events.onStateChange({data:1}); events.onError(); expect(player.progress().playing).toBe(false);
  }
  player.dispose();expect(instance.destroy).toHaveBeenCalledTimes(created);
});

async function recoveryPlayer() {
  vi.useFakeTimers(); vi.setSystemTime(100000);
  const instances: any[] = [];
  let intersection: (entries: { intersectionRatio: number }[]) => void;
  const preferences = { enabled: true, volume: 40 };
  vi.stubGlobal('window', { setTimeout, YT: { Player: class {
    constructor(_el: HTMLElement, options: any) {
      let videoId = '';
      const instance = {
        events: options.events, cueVideoById: vi.fn(),
        loadVideoById: vi.fn((v: any) => { videoId = v.videoId; }),
        playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(),
        getCurrentTime: () => 40, seekTo: vi.fn(), getDuration: () => 600,
        getVideoData: () => ({ video_id: videoId }), destroy: vi.fn(),
      };
      instances.push(instance); return instance;
    }
  } } });
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => ({}) });
  vi.stubGlobal('document', document); vi.stubGlobal('location', { origin: 'http://localhost:5178' });
  vi.stubGlobal('IntersectionObserver', class { constructor(cb: typeof intersection) { intersection = cb; } observe() {} disconnect() {} });
  const queue = new LoungeRadioQueue(); queue.snapshot(60000);
  const state = queue.snapshot(100000), feedback = vi.fn();
  const player = createYoutubePlayer({ append() {}, replaceChildren() {} } as unknown as HTMLElement, {
    preferences: () => preferences, enable: () => { preferences.enabled = true; }, duration() {}, feedback,
  });
  player.update(state); await player.join(); instances[0].events.onReady();
  return { player, instances, preferences, document, state, queue, feedback,
    intersect: (ratio: number) => intersection!([{ intersectionRatio: ratio }]),
    async advance(ms: number) { await vi.advanceTimersByTimeAsync(ms); player.update(state); await Promise.resolve(); },
  };
}

it('retries transient failures at the live shared position and ignores the destroyed player', async () => {
  const h = await recoveryPlayer(), old = h.instances[0];
  try {
    old.events.onStateChange({ data: 1 }); old.events.onError({ data: 5 });
    await h.advance(1999); expect(h.instances).toHaveLength(1);
    await h.advance(1); expect(h.instances).toHaveLength(2); expect(old.destroy).toHaveBeenCalledOnce();
    const recovered = h.instances[1]; recovered.events.onReady();
    expect(recovered.loadVideoById).toHaveBeenCalledWith({ videoId: h.state.current!.videoId, startSeconds: 42 });
    recovered.events.onStateChange({ data: 1 });
    old.events.onError({ data: 5 }); old.events.onAutoplayBlocked(); old.events.onStateChange({ data: 2 });
    expect(h.player.progress().playing).toBe(true); expect(h.feedback).toHaveBeenLastCalledWith('');
    await h.advance(20000); expect(h.instances).toHaveLength(2);
  } finally { h.player.dispose(); }
});

it('backs off after repeated failures, stops after three retries, and allows an explicit retry', async () => {
  const h = await recoveryPlayer();
  try {
    for (const delay of [2000, 5000, 15000]) {
      const old = h.instances.at(-1); old.events.onError({ data: 5 });
      const count = h.instances.length;
      await h.advance(delay - 1); expect(h.instances).toHaveLength(count);
      await h.advance(1); expect(h.instances).toHaveLength(count + 1);
      h.instances.at(-1).events.onReady();
    }
    h.instances.at(-1).events.onError({ data: 5 }); await h.advance(60000);
    expect(h.instances).toHaveLength(4); expect(h.feedback).toHaveBeenLastCalledWith('Music could not reconnect. Press play to retry.');
    h.player.play(); await Promise.resolve(); expect(h.instances).toHaveLength(5);
    h.instances.at(-1).events.onReady(); h.instances.at(-1).events.onError({ data: 5 });
    await h.advance(2000); expect(h.instances).toHaveLength(6);
  } finally { h.player.dispose(); }
});

it('recovers stuck buffering but leaves short buffering alone', async () => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 }); first.events.onStateChange({ data: 3 });
    await h.advance(10000); first.events.onStateChange({ data: 1 });
    await h.advance(20000); expect(h.instances).toHaveLength(1);
    first.events.onStateChange({ data: 3 }); await h.advance(15000);
    expect(h.feedback).toHaveBeenLastCalledWith('Reconnecting music…');
    await h.advance(2000); expect(h.instances).toHaveLength(2);
  } finally { h.player.dispose(); }
});

it('recovers an iframe that never becomes ready', async () => {
  const h = await recoveryPlayer();
  try {
    h.player.reset(); await h.player.open();
    await h.advance(15000); await h.advance(2000);
    expect(h.instances).toHaveLength(3);
    expect(h.instances[1].destroy).toHaveBeenCalledOnce();
    h.instances[2].events.onReady();
    expect(h.instances[2].loadVideoById).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 57 }));
  } finally { h.player.dispose(); }
});

it('reloads a failed or timed-out API script, restoring its callback and rejoining the shared clock', async () => {
  const h = await recoveryPlayer(), youtube = window.YT, previous = vi.fn();
  const scripts: any[] = [];
  try {
    window.YT = undefined; window.onYouTubeIframeAPIReady = previous;
    Object.assign(h.document, {
      createElement: () => ({ remove: vi.fn() }), head: { append: (script: any) => scripts.push(script) },
    });
    h.player.reset(); const opening = h.player.open();
    scripts[0].onerror(); await opening;
    expect(scripts[0].remove).toHaveBeenCalledOnce(); expect(window.onYouTubeIframeAPIReady).toBe(previous);
    await h.advance(2000); expect(scripts).toHaveLength(2);
    await h.advance(15000); expect(scripts[1].remove).toHaveBeenCalledOnce();
    expect(window.onYouTubeIframeAPIReady).toBe(previous);
    await h.advance(5000); expect(scripts).toHaveLength(3);
    window.YT = youtube; window.onYouTubeIframeAPIReady!(); await Promise.resolve();
    expect(previous).toHaveBeenCalledOnce(); expect(window.onYouTubeIframeAPIReady).toBe(previous);
    h.instances[1].events.onReady();
    expect(h.instances[1].loadVideoById).toHaveBeenCalledWith(expect.objectContaining({ startSeconds: 62 }));
  } finally { h.player.dispose(); }
});

it.each([2, 100, 101, 150, 153])('does not repeatedly retry unavailable or disallowed video error %s', async code => {
  const h = await recoveryPlayer();
  try {
    h.instances[0].events.onError({ data: code }); await h.advance(60000);
    expect(h.instances).toHaveLength(1);
    h.queue.enqueue(DJ_VIDEOS[1].videoId, 'Alice', Date.now());
    h.player.update(h.queue.snapshot(Date.now()));
    expect(h.instances[0].loadVideoById).toHaveBeenLastCalledWith({ videoId: DJ_VIDEOS[1].videoId, startSeconds: 0 });
  } finally { h.player.dispose(); }
});

it.each(['pause', 'iframe pause', 'mute', 'disabled', 'hidden', 'offscreen', 'close', 'dispose', 'autoplay'])('suppresses automatic recovery while %s', async reason => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 });
    if (reason === 'iframe pause') first.events.onStateChange({ data: 2 });
    first.events.onError({ data: 5 });
    if (reason === 'pause') h.player.pause();
    if (reason === 'mute') h.preferences.volume = 0;
    if (reason === 'disabled') h.preferences.enabled = false;
    if (reason === 'hidden') { h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'offscreen') h.intersect(0);
    if (reason === 'close') h.player.hide();
    if (reason === 'dispose') h.player.dispose();
    if (reason === 'autoplay') first.events.onAutoplayBlocked();
    await h.advance(60000); expect(h.instances).toHaveLength(1);
    if (reason === 'autoplay') {
      first.playVideo.mockClear(); h.document.dispatchEvent(new Event('pointerdown'));
      expect(first.playVideo).toHaveBeenCalledOnce();
    }
  } finally { if (reason !== 'dispose') h.player.dispose(); }
});

it('resumes after reconnecting to the room without overriding a listener pause', async () => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 }); h.player.update(undefined); first.events.onStateChange({ data: 2 });
    await vi.advanceTimersByTimeAsync(10000); h.player.update(h.queue.snapshot(Date.now()));
    expect(first.seekTo).toHaveBeenLastCalledWith(50, true);
    first.events.onStateChange({ data: 1 }); h.player.pause();
    h.player.update(undefined); first.events.onStateChange({ data: 2 }); first.playVideo.mockClear();
    await vi.advanceTimersByTimeAsync(10000); h.player.update(h.queue.snapshot(Date.now()));
    expect(first.playVideo).not.toHaveBeenCalled();
  } finally { h.player.dispose(); }
});

it.each(['transport pause', 'iframe pause', 'disconnect', 'replaced video', 'already playing'])('ignores a delayed autoplay block after %s', async reason => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    if (reason === 'transport pause') h.player.pause();
    if (reason === 'iframe pause') { first.events.onStateChange({ data: 1 }); first.events.onStateChange({ data: 2 }); }
    if (reason === 'disconnect') h.player.update(undefined);
    if (reason === 'replaced video') {
      const oldVideoId = h.state.current!.videoId;
      const nextVideo = DJ_VIDEOS.find(video => video.videoId !== oldVideoId)!;
      h.queue.enqueue(nextVideo.videoId, 'Alice', Date.now());
      h.player.update(h.queue.snapshot(Date.now()));
      first.getVideoData = () => ({ video_id: oldVideoId });
    }
    if (reason === 'already playing') first.events.onStateChange({ data: 1 });
    first.playVideo.mockClear(); h.feedback.mockClear();
    first.events.onAutoplayBlocked();
    h.document.dispatchEvent(new Event('pointerdown'));
    h.document.dispatchEvent(new Event('keydown'));
    expect(first.playVideo).not.toHaveBeenCalled();
    expect(h.feedback).not.toHaveBeenCalled();
    expect(h.instances).toHaveLength(1);
  } finally { h.player.dispose(); }
});

it.each(['hidden', 'offscreen', 'close', 'disabled'])('resumes interrupted buffering after %s without losing playback intent', async reason => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 }); first.events.onStateChange({ data: 3 });
    if (reason === 'hidden') { h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'offscreen') h.intersect(0);
    if (reason === 'close') h.player.hide();
    if (reason === 'disabled') { h.preferences.enabled = false; h.player.update(h.state); }
    first.events.onStateChange({ data: 2 }); first.playVideo.mockClear();
    await h.advance(10000); expect(first.playVideo).not.toHaveBeenCalled();
    if (reason === 'hidden') { h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'offscreen') h.intersect(1);
    if (reason === 'close') await h.player.open();
    if (reason === 'disabled') { h.preferences.enabled = true; h.player.update(h.state); }
    expect(first.playVideo).toHaveBeenCalledOnce();
    expect(first.seekTo).toHaveBeenLastCalledWith(50, true);
    first.events.onStateChange({ data: 1 }); await h.advance(20000);
    expect(h.instances).toHaveLength(1);
  } finally { h.player.dispose(); }
});

it.each(['same video', 'different video'])('ignores a loading pause when changing to a new entry with the %s', async kind => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 });
    if (kind === 'same video') h.queue.skip(h.state.current!.id, Date.now());
    else h.queue.enqueue(DJ_VIDEOS[1].videoId, 'Alice', Date.now());
    const next = h.queue.snapshot(Date.now()); h.player.update(next);
    first.pauseVideo.mockClear(); first.events.onStateChange({ data: 2 });
    await vi.advanceTimersByTimeAsync(1000); h.player.update(next);
    expect(first.pauseVideo).not.toHaveBeenCalled();
    first.events.onStateChange({ data: 3 }); first.events.onStateChange({ data: 1 });
    expect(h.player.progress().playing).toBe(true);
    // The same native pause must be honored after the new entry starts playing.
    first.events.onStateChange({ data: 2 }); first.playVideo.mockClear();
    h.player.hide(); await h.player.open();
    await vi.advanceTimersByTimeAsync(20000); h.player.update(next);
    expect(first.playVideo).not.toHaveBeenCalled(); expect(h.instances).toHaveLength(1);
  } finally { h.player.dispose(); }
});

it('keeps the stall watchdog active through an internal track-loading pause', async () => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 });
    h.queue.skip(h.state.current!.id, Date.now());
    const next = h.queue.snapshot(Date.now()); h.player.update(next);
    first.events.onStateChange({ data: 2 });
    await vi.advanceTimersByTimeAsync(15000); h.player.update(next);
    expect(h.feedback).toHaveBeenLastCalledWith('Reconnecting music…');
    await vi.advanceTimersByTimeAsync(2000); h.player.update(next); await Promise.resolve();
    expect(h.instances).toHaveLength(2);
  } finally { h.player.dispose(); }
});

it('allows an explicit pause to cancel a new entry that is still loading', async () => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 });
    h.queue.skip(h.state.current!.id, Date.now());
    const next = h.queue.snapshot(Date.now()); h.player.update(next);
    h.player.pause(); first.events.onStateChange({ data: 2 }); first.playVideo.mockClear();
    h.player.hide(); await h.player.open();
    await vi.advanceTimersByTimeAsync(30000); h.player.update(next);
    expect(first.playVideo).not.toHaveBeenCalled(); expect(h.instances).toHaveLength(1);
  } finally { h.player.dispose(); }
});

it.each(['hidden', 'offscreen', 'close', 'disabled'])('keeps an iframe pause when returning from %s', async reason => {
  const h = await recoveryPlayer(), first = h.instances[0];
  try {
    first.events.onStateChange({ data: 1 }); first.events.onStateChange({ data: 2 });
    if (reason === 'hidden') { h.document.hidden = true; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'offscreen') h.intersect(0);
    if (reason === 'close') h.player.hide();
    if (reason === 'disabled') { h.preferences.enabled = false; h.player.update(h.state); }
    first.events.onStateChange({ data: 2 }); first.playVideo.mockClear();
    await h.advance(10000);
    if (reason === 'hidden') { h.document.hidden = false; h.document.dispatchEvent(new Event('visibilitychange')); }
    if (reason === 'offscreen') h.intersect(1);
    if (reason === 'close') await h.player.open();
    if (reason === 'disabled') { h.preferences.enabled = true; h.player.update(h.state); }
    await h.advance(20000);
    expect(first.playVideo).not.toHaveBeenCalled(); expect(h.instances).toHaveLength(1);
  } finally { h.player.dispose(); }
});

it('joins the shared timestamp, retries blocked autoplay on interaction, and catches up after a pause', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(100000);
  let events: any, enabled = false, videoId = '';
  const instance = {
    cueVideoById: vi.fn(), loadVideoById: vi.fn((v: any) => { videoId = v.videoId; }),
    playVideo: vi.fn(), pauseVideo: vi.fn(), setVolume: vi.fn(), getCurrentTime: () => 0,
    seekTo: vi.fn(), getDuration: () => 600, getVideoData: () => ({video_id: videoId}), destroy: vi.fn(),
  };
  vi.stubGlobal('window', {YT: {Player: class { constructor(_el: any, options: any) { events = options.events; return instance; } }}});
  const document = Object.assign(new EventTarget(), {hidden: false, createElement: () => ({})});
  vi.stubGlobal('document', document); vi.stubGlobal('location', {origin: 'http://localhost:5173'});
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  const player = createYoutubePlayer({append() {}} as unknown as HTMLElement, {
    preferences: () => ({enabled, volume: 40}), enable: () => { enabled = true; }, duration() {}, feedback() {},
  });
  try {
    const queue = new LoungeRadioQueue(); queue.snapshot(60000);
    player.update(queue.snapshot(100000));
    await player.join(); events.onReady();
    expect(instance.loadVideoById).toHaveBeenCalledWith(expect.objectContaining({startSeconds: 40}));
    events.onAutoplayBlocked(); instance.playVideo.mockClear();
    document.dispatchEvent(new Event('pointerdown'));
    expect(instance.playVideo).toHaveBeenCalledOnce();
    events.onStateChange({data: 1});
    const currentId = queue.snapshot(100000).current!.id;
    player.scratch(currentId, -.5); expect(instance.seekTo).toHaveBeenLastCalledWith(39.5, true);
    player.scratch(currentId, .5); expect(instance.seekTo).toHaveBeenLastCalledWith(40.5, true);
    player.scratch(currentId, 0); expect(instance.seekTo).toHaveBeenLastCalledWith(40, true);
    instance.seekTo.mockClear(); player.scratch(-1, .5); expect(instance.seekTo).not.toHaveBeenCalled();
    player.pause();
    now.mockReturnValue(120000); player.play();
    expect(instance.seekTo).toHaveBeenLastCalledWith(60, true);
    events.onStateChange({data: 1}); now.mockReturnValue(140000); player.update(queue.snapshot(140000));
    expect(instance.seekTo).toHaveBeenLastCalledWith(80, true);
    events.onAutoplayBlocked(); player.pause(); instance.playVideo.mockClear();
    document.dispatchEvent(new Event('pointerdown')); expect(instance.playVideo).not.toHaveBeenCalled();
  } finally { player.dispose(); now.mockRestore(); }
});
