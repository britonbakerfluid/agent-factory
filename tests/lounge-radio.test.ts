import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoungeRadioQueue, DJ_VIDEOS, RADIO_QUEUE_LIMIT, youtubeVideoId, radioMood } from '../shared/lounge-radio';
import { LoungeRadio } from '../server/lounge-radio';
import type { BroadcastManager } from '../server/ws/broadcast';
import type { WebSocket } from '@fastify/websocket';
const [a,b,c] = DJ_VIDEOS.map(v => v.videoId);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('YouTube queue', () => {
  it('removes queued songs without changing playback and rejects stale edits',()=>{
    const q=new LoungeRadioQueue();q.enqueue(a,'Alice',0);q.enqueue(b,'Bob',0);
    const before=q.snapshot(0);expect(q.remove(before.queue[0].id,before.revision).success).toBe(true);
    expect(q.snapshot(0).current?.id).toBe(before.current?.id);expect(q.snapshot(0).queue).toHaveLength(0);
    expect(q.remove(before.queue[0].id,before.revision).success).toBe(false);
  });
  it('accepts supported YouTube links and rejects other hosts, scripts and malformed IDs', () => {
    for (const url of [`https://youtu.be/${a}?t=2`, `https://www.youtube.com/watch?v=${a}&list=x`, `https://music.youtube.com/watch?v=${a}`, `https://youtube.com/shorts/${a}`, a]) expect(youtubeVideoId(url)).toBe(a);
    for (const url of [`https://youtube.com.evil.test/watch?v=${a}`, `javascript:${a}`, 'file:///etc/passwd', 'https://youtube.com/playlist?list=foo', 'too-short', undefined]) expect(youtubeVideoId(url)).toBeUndefined();
  });
  it('uses Mountain time for day, evening and night picks', () => {
    expect(radioMood(Date.parse('2026-09-08T16:00:00Z'))).toBe('day');
    expect(radioMood(Date.parse('2026-09-09T00:00:00Z'))).toBe('evening');
    expect(radioMood(Date.parse('2026-09-09T06:00:00Z'))).toBe('night');
  });
  it('plays every pick before repeating, and resumes its place after a human request', () => {
    for (const stamp of ['2026-09-08T16:00:00Z', '2026-09-09T00:00:00Z', '2026-09-09T06:00:00Z']) {
      const now = Date.parse(stamp), q = new LoungeRadioQueue();
      const picks = DJ_VIDEOS.filter(v => v.mood === radioMood(now));
      expect(picks.length).toBeGreaterThan(2);
      const heard: string[] = [];
      for (let i = 0; i < picks.length; i++) {
        const current = q.snapshot(now).current!;
        heard.push(current.videoId); q.skip(current.id, now);
      }
      expect(new Set(heard).size).toBe(picks.length);
      expect(q.snapshot(now).current?.videoId).toBe(heard[0]);
      q.enqueue(a, 'Alice', now);
      q.skip(q.snapshot(now).current!.id, now);
      expect(q.snapshot(now).current).toMatchObject({ videoId: heard[1], dj: true });
    }
  });
  it('fills silence, prioritizes human songs and resumes the DJ after the queue finishes', () => {
    const q = new LoungeRadioQueue(); expect(q.snapshot(1000).current?.dj).toBe(true);
    q.enqueue(a, 'Alice', 2000); const song = q.snapshot(2000).current!;
    expect(song).toMatchObject({ videoId:a, queuedBy:'Alice', dj:false });
    q.duration(song.id, 20, 2000); q.enqueue(b, 'Bob', 3000);
    expect(q.snapshot(22000).current).toMatchObject({ videoId:b, dj:false });
    expect(q.snapshot(622000).current?.dj).toBe(true);
  });
  it('bounds the queue and snapshots are detached', () => {
    const q = new LoungeRadioQueue(); q.enqueue(a,'Alice',1000);
    for(let i=0;i<RADIO_QUEUE_LIMIT;i++) expect(q.enqueue(b,'Bob',1000).success).toBe(true);
    expect(q.enqueue(c,'Bob',1000).success).toBe(false);
    const state=q.snapshot(1000); state.queue.pop(); state.current!.title='bad';
    expect(q.snapshot(1000).queue).toHaveLength(RADIO_QUEUE_LIMIT);
    expect(q.snapshot(1000).current!.title).not.toBe('bad');
  });
  it('reorders only a complete current permutation and rejects stale concurrent edits', () => {
    const q=new LoungeRadioQueue(); q.enqueue(a,'a',0);q.enqueue(b,'b',0);q.enqueue(c,'c',0);
    const state=q.snapshot(0), ids=state.queue.map(v=>v.id).reverse();
    expect(q.reorder([ids[0],ids[0]],state.revision).success).toBe(false);
    expect(q.reorder(ids,state.revision).success).toBe(true);
    expect(q.snapshot(0).queue.map(v=>v.id)).toEqual(ids);
    expect(q.reorder(ids,state.revision).success).toBe(false);
  });
  it('rejects stale durations and skips, freezes first duration, and bounds unknown streams', () => {
    const q=new LoungeRadioQueue();q.enqueue(a,'a',0);const id=q.snapshot(0).current!.id;
    expect(q.duration(id,Infinity,0).success).toBe(false);
    expect(q.duration(id,30,0).success).toBe(true);q.duration(id,100,0);
    expect(q.snapshot(0).current!.duration).toBe(30);
    q.skip(id,1);expect(q.skip(id,2).success).toBe(false);expect(q.duration(id,20,2).success).toBe(false);
  });
  it('authenticates edits, fetches only official metadata, and broadcasts the trusted username', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const sendTo=vi.fn(),broadcastRadio=vi.fn();let authenticated=false;
    const manager=new LoungeRadio({sendTo,broadcastRadio,getSocketPrincipal:()=>authenticated?{ownerId:'owner',username:'Alice'}:undefined} as unknown as BroadcastManager);
    const socket={} as WebSocket;
    const fetch=vi.fn(async()=>({ok:true,json:async()=>({title:'Real title'})}));vi.stubGlobal('fetch',fetch);
    await manager.receive(socket,{type:'radio_queue',action:'add',videoId:a});expect(fetch).not.toHaveBeenCalled();
    authenticated=true;await manager.receive(socket,{type:'radio_queue',action:'add',videoId:a});
    expect(fetch.mock.calls[0][0]).toContain('https://www.youtube.com/oembed?');
    expect(broadcastRadio.mock.lastCall?.[0].current).toMatchObject({queuedBy:'Alice',title:'Real title'});
    await manager.receive(socket,{type:'radio_queue',action:'add',videoId:b});expect(sendTo.mock.lastCall?.[1].success).toBe(false);
  });
});

describe('curated variety', () => {
  it('has distinct playable IDs and a full rotation for every time of day', () => {
    expect(DJ_VIDEOS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(DJ_VIDEOS.map(v => v.videoId)).size).toBe(DJ_VIDEOS.length);
    for (const mood of ['day', 'evening', 'night']) {
      const choices = DJ_VIDEOS.filter(v => v.mood === mood);
      expect(choices.length).toBeGreaterThanOrEqual(12);
      for (let i = 0; i < choices.length; i++) {
        expect(youtubeVideoId(choices[i].videoId)).toBe(choices[i].videoId);
        expect(choices[i].artist).not.toBe(choices[(i + 1) % choices.length].artist);
      }
    }
  });
  it('avoids the same DJ artist when the mood changes, including manual skips', () => {
    const q = new LoungeRadioQueue();
    const day = Date.parse('2026-09-08T22:59:00Z');
    const evening = Date.parse('2026-09-08T23:01:00Z');
    const first = q.snapshot(day).current!;
    const artist = DJ_VIDEOS.find(v => v.videoId === first.videoId)!.artist;
    q.skip(first.id, evening);
    const next = q.snapshot(evening).current!;
    expect(DJ_VIDEOS.find(v => v.videoId === next.videoId)!.artist).not.toBe(artist);
    expect(next.dj).toBe(true);
  });
});
