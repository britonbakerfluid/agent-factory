import { routeToStation, type RoomPoint } from './factory25d-layout.js';

export interface FixtureCleanupJob {
  id: string;
  label: string;
  /** The fixture and an unobstructed place to stand beside it, in room world coordinates. */
  point: RoomPoint;
  standAt: RoomPoint;
  isPending: () => boolean;
  recover: () => void;
}
export type StaffCleanupPhase = 'idle' | 'walking' | 'cleaning' | 'returning';
const distance = (a: RoomPoint, b: RoomPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** A single clerk handles prop mishaps without moving any real agent. */
export class StaffCleanup {
  phase: StaffCleanupPhase = 'idle';
  position: RoomPoint;
  motion: RoomPoint = { x: 0, z: 0 };
  facing: RoomPoint = { x: 0, z: 1 };
  private jobs: FixtureCleanupJob[] = [];
  private current?: FixtureCleanupJob;
  private path: RoomPoint[] = [];
  private elapsed = 0;
  private restored = false;

  constructor(readonly home: RoomPoint) { this.position = { ...home }; }
  get job() { return this.current; }
  get queued() { return this.jobs.length; }
  enqueue(job: FixtureCleanupJob) {
    if (this.current?.id === job.id || this.jobs.some(queued => queued.id === job.id)) return;
    this.jobs.push(job);
  }
  private walkTo(target: RoomPoint) {
    const path = routeToStation(this.position, target);
    if (distance(path.at(-1) ?? this.position, target) > .01) return false;
    this.path = path.map(point => ({ ...point }));
    return true;
  }
  private next() {
    this.current = undefined;
    while (this.jobs.length) {
      const job = this.jobs.shift()!;
      if (!job.isPending() || !this.walkTo(job.standAt)) continue;
      this.current = job; this.phase = 'walking'; return;
    }
    this.walkTo(this.home);
    this.phase = this.path.length && distance(this.position, this.home) > .01 ? 'returning' : 'idle';
  }
  update(seconds: number, visible = true) {
    this.motion = { x: 0, z: 0 };
    if (!visible || !Number.isFinite(seconds) || seconds <= 0) return;
    const dt = Math.min(.05, seconds);
    if (this.phase === 'idle' && this.jobs.length || this.phase === 'returning' && this.jobs.length) this.next();
    if (this.phase === 'walking' && !this.current?.isPending()) this.next();
    if (this.phase === 'cleaning') {
      this.elapsed += dt;
      // Reach, lift the intact fixture, then take a short moment to check it.
      if (!this.restored && this.elapsed >= .4) { this.restored = true; this.current?.recover(); }
      if (this.elapsed >= 1.35) {
        // A new flurry of clicks can undo the lift while the clerk is still
        // beside it. Keep that new mishap instead of losing a duplicate event.
        if (this.current?.isPending()) this.jobs.push(this.current);
        this.next();
      }
      return;
    }
    if (this.phase !== 'walking' && this.phase !== 'returning') return;
    const before = { ...this.position };
    let travel = dt * 1.6;
    while (this.path.length && travel > 0) {
      const target = this.path[0], length = distance(this.position, target);
      if (length <= travel) { this.position = { ...target }; this.path.shift(); travel -= length; }
      else {
        this.position.x += (target.x - this.position.x) * travel / length;
        this.position.z += (target.z - this.position.z) * travel / length;
        travel = 0;
      }
    }
    this.motion = { x: this.position.x - before.x, z: this.position.z - before.z };
    if (distance(this.motion, { x: 0, z: 0 }) > .0001) this.facing = { ...this.motion };
    if (!this.path.length) {
      this.phase = this.current ? 'cleaning' : 'idle'; this.elapsed = 0; this.restored = false;
      if (this.current) this.facing = { x: this.current.point.x - this.position.x, z: this.current.point.z - this.position.z };
    }
  }
  dispose() { this.jobs = []; this.current = undefined; this.path = []; }
}
