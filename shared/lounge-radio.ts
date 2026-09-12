/** Only official YouTube embeds are played; these are curated fallbacks, not generated recommendations. */
export const DJ_VIDEOS = [
  { videoId: 'LMeluRz2wv4', title: 'Doomsday · MF DOOM', mood: 'day' },
  { videoId: 'G8_HqSbOw_M', title: 'All Time Low · Jon Bellion', mood: 'day' },
  { videoId: 'elVF7oG0pQs', title: "Heard ’Em Say · Kanye West feat. Adam Levine", mood: 'day' },
  { videoId: 'dERcdvcXuE0', title: 'Rapp Snitch Knishes · MF DOOM feat. Mr. Fantastik', mood: 'evening' },
  { videoId: '3VxuMErCd-E', title: 'Blu · Jon Bellion', mood: 'evening' },
  { videoId: 'ZtkNfC5Oymw', title: 'Everything I Am · Kanye West feat. DJ Premier', mood: 'evening' },
  { videoId: 'j2DJbV5zyoQ', title: 'Arrowroot · MF DOOM', mood: 'night' },
  { videoId: '0vmhgotEByc', title: 'Time: The Donut of the Heart · J Dilla', mood: 'night' },
  { videoId: 'pzy1ZeX8ZOY', title: 'Blu (Acoustic) · Jon Bellion', mood: 'night' },
] as const;
export interface RadioEntry { id: number; videoId: string; title: string; queuedBy: string; dj: boolean }
export interface RadioScratch { type: 'radio_scratch'; entryId: number; deck: number; offset: number; serverTime: number }
export interface RadioState { type: 'radio_state'; serverTime: number; revision: number; current: (RadioEntry & { startedAt: number; duration: number; durationKnown: boolean }) | null; queue: RadioEntry[] }
export type RadioRequest = { type: 'radio_queue' } & (
  { action: 'scratch'; entryId: number; deck: number; offset: number } | { action: 'add'; videoId: string } | { action: 'remove'; entryId: number; revision: number } | { action: 'reorder'; ids: number[]; revision: number } |
  { action: 'duration'; entryId: number; seconds: number } | { action: 'skip'; entryId: number });
export interface RadioResult { type: 'radio_result'; success: boolean; error?: string; silent?: boolean }
export const RADIO_QUEUE_LIMIT = 8;
export function youtubeVideoId(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length > 2048) return;
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1).split('/')[0]
      : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null : null;
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch { return; }
}
export function radioMood(now: number) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 7 || hour >= 22 ? 'night' : hour >= 17 ? 'evening' : 'day';
}
const ok = (): RadioResult => ({ type: 'radio_result', success: true });
const fail = (error: string): RadioResult => ({ type: 'radio_result', success: false, error });
/** Shared clock and queue, also used in the isolated local preview. */
export class LoungeRadioQueue {
  private current: RadioState['current'] = null;
  private queue: RadioEntry[] = [];
  private sequence = 0;
  private revision = 0;
  private djCursor = { day: 0, evening: 0, night: 0 };
  private start(entry: RadioEntry, now: number) { this.current = { ...entry, startedAt: now, duration: 600, durationKnown: false }; this.revision++; }
  advance(now: number) {
    if (this.current && now < this.current.startedAt + this.current.duration * 1000) return false;
    const next = this.queue.shift();
    if (next) this.start(next, now);
    else {
      const mood = radioMood(now);
      const choices = DJ_VIDEOS.filter(v => v.mood === mood);
      const video = choices[this.djCursor[mood] % choices.length];
      this.djCursor[mood] = (this.djCursor[mood] + 1) % choices.length;
      this.start({ ...video, id: ++this.sequence, queuedBy: 'lounge DJ', dj: true }, now);
    }
    return true;
  }
  enqueue(videoId: unknown, username: string, now: number, title?: string): RadioResult {
    const id = youtubeVideoId(videoId);
    if (!id) return fail('Paste a YouTube video link.');
    if (this.queue.length >= RADIO_QUEUE_LIMIT) return fail('The queue is full. Wait for a song to finish.');
    const entry = { id: ++this.sequence, videoId: id, title: (title || `YouTube · ${id}`).slice(0, 160), queuedBy: username.slice(0, 80), dj: false };
    // Human requests take over from the fallback DJ immediately.
    if (!this.current || this.current.dj) this.start(entry, now);
    else { this.queue.push(entry); this.revision++; }
    return ok();
  }
  reorder(ids: unknown, revision: unknown): RadioResult {
    if (revision !== this.revision) return fail('The queue changed. Try moving that song again.');
    if (!Array.isArray(ids) || ids.length !== this.queue.length || new Set(ids).size !== ids.length || ids.some(id => !this.queue.some(entry => entry.id === id))) return fail('That queue order is no longer available.');
    this.queue = ids.map(id => this.queue.find(entry => entry.id === id)!); this.revision++; return ok();
  }
  remove(id: unknown, revision: unknown): RadioResult {
    if (revision !== this.revision) return fail('The queue changed. Try again.');
    const index = this.queue.findIndex(entry => entry.id === id);
    if (index < 0) return fail('That song has already left the queue.');
    this.queue.splice(index, 1); this.revision++; return ok();
  }
  duration(id: unknown, seconds: unknown, now: number): RadioResult {
    if (!this.current || id !== this.current.id || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 5 || seconds > 10800) return fail('That video duration is unavailable.');
    if (!this.current.durationKnown) {
      // A playing embed reports duration; an old/late player cannot end a newer track.
      this.current.duration = Math.max(seconds, (now - this.current.startedAt) / 1000 + 1);
      this.current.durationKnown = true; this.revision++;
    }
    return ok();
  }
  skip(id: unknown, now: number): RadioResult {
    if (!this.current || id !== this.current.id) return fail('That song has already changed.');
    this.current = null; this.advance(now); return ok();
  }
  snapshot(now: number): RadioState {
    this.advance(now);
    return { type: 'radio_state', serverTime: now, revision: this.revision, current: this.current ? { ...this.current } : null, queue: this.queue.map(entry => ({ ...entry })) };
  }
}
