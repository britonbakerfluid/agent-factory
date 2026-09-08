import { FACTORY_OBSTACLES, INDOOR_COLUMNS, INDOOR_ROWS, INTERIOR_Z } from '@shared/factory25d-layout';
import type { FloorPoint as Point } from './factory25dKeyboardState';
import { AVATAR_FRAME_DISTANCE } from './factory25dAvatarGait';

type Rect = { left: number; right: number; near: number; far: number };
export type BoardManagerPhase = 'idle' | 'waiting' | 'approaching' | 'grabbing' | 'returning' | 'releasing' | 'walking-home' | 'walking-to-note' | 'writing';
export type BoardManagerNote = Point & { id?: string; label?: string };
const actorBounds = { left: -7.75, right: 7.75, near: -4.8, far: 3.3 };
const boardBounds = { left: -7.25, right: 7.25, near: -4.7, far: 2.6 };
const furniture: Rect[] = FACTORY_OBSTACLES.map(o => ({ ...o, near: o.near - INTERIOR_Z, far: o.far - INTERIOR_Z }))
  .filter(o => o.right > actorBounds.left && o.left < actorBounds.right && o.far > actorBounds.near && o.near < actorBounds.far);
const boardObstacles: Rect[] = INDOOR_COLUMNS.flatMap(x => INDOOR_ROWS.map(z => ({ left: x - .99, right: x + .99, near: z - .79, far: z + .79 })));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, z: a.z + b.z });
const shifted = (r: Rect, p: Point): Rect => ({ left: r.left - p.x, right: r.right - p.x, near: r.near - p.z, far: r.far - p.z });
const within = (p: Point, r: Rect) => p.x >= r.left && p.x <= r.right && p.z >= r.near && p.z <= r.far;

function clearSegment(a: Point, b: Point, obstacles: Rect[], bounds: Rect) {
  if (!within(a, bounds) || !within(b, bounds)) return false;
  return !obstacles.some(o => {
    let near = 0, far = 1;
    for (const [p, q] of [[a.x - b.x, a.x - o.left], [b.x - a.x, o.right - a.x], [a.z - b.z, a.z - o.near], [b.z - a.z, o.far - a.z]]) {
      if (p === 0) { if (q <= 0) return false; continue; }
      if (p < 0) near = Math.max(near, q / p); else far = Math.min(far, q / p);
      if (near >= far) return false;
    }
    return far > 0 && near < 1;
  });
}

/** Visibility paths preserve narrow aisles that a coarse navigation grid misses. */
function route(from: Point, to: Point, obstacles: Rect[], bounds: Rect): Point[] | null {
  const clear = (a: Point, b: Point) => clearSegment(a, b, obstacles, bounds);
  if (clear(from, to)) return [{ ...to }];
  const corners = obstacles.flatMap(o => [
    { x: o.left - .015, z: o.near - .015 }, { x: o.left - .015, z: o.far + .015 },
    { x: o.right + .015, z: o.near - .015 }, { x: o.right + .015, z: o.far + .015 },
  ]).filter(p => clear(p, p));
  const points = [from, to, ...corners], costs = points.map(() => Infinity), previous = points.map(() => -1);
  const visited = new Set<number>(); costs[0] = 0;
  while (visited.size < points.length) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current === 1 || !Number.isFinite(costs[current])) break;
    visited.add(current);
    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      const next = costs[current] + distance(points[current], points[i]);
      if (next < costs[i] && clear(points[current], points[i])) { costs[i] = next; previous[i] = current; }
    }
  }
  if (!Number.isFinite(costs[1])) return null;
  const result: Point[] = [];
  for (let i = 1; i !== 0; i = previous[i]) result.unshift({ ...points[i] });
  return result;
}

function boardFootprint(board: Point): Rect {
  return { left: board.x - .68, right: board.x + .68, near: board.z - .43, far: board.z + .43 };
}
export function managerPath(from: Point, to: Point, board: Point) {
  const footprint = boardFootprint(board), obstacles = [...furniture, footprint];
  // A user can roll the board over the waiting person's feet. Once released,
  // step out of that overlap before treating the board as a walking obstacle.
  if (within(from, footprint)) {
    const exits = [{ x: footprint.left - .02, z: from.z }, { x: footprint.right + .02, z: from.z },
      { x: from.x, z: footprint.near - .02 }, { x: from.x, z: footprint.far + .02 }]
      .sort((a, b) => distance(from, a) - distance(from, b));
    for (const exit of exits) {
      if (!clearSegment(from, exit, furniture, actorBounds)) continue;
      const rest = route(exit, to, obstacles, actorBounds);
      if (rest) return [exit, ...rest];
    }
    return null;
  }
  return route(from, to, obstacles, actorBounds);
}
export function boardReturnPath(from: Point, home: Point, grip: Point) {
  const actorRoom = shifted(actorBounds, grip);
  const bounds = { left: Math.max(boardBounds.left, actorRoom.left), right: Math.min(boardBounds.right, actorRoom.right),
    near: Math.max(boardBounds.near, actorRoom.near), far: Math.min(boardBounds.far, actorRoom.far) };
  return route(from, home, [...boardObstacles, ...furniture.map(o => shifted(o, grip))], bounds);
}

function advance(point: Point, path: Point[], amount: number): Point {
  const target = path[0];
  if (!target) return { ...point };
  const length = distance(point, target);
  // End a step at its corner. Combining two headings in one frame made the
  // character snap diagonally as their hands kept moving the board sideways.
  if (length <= amount) { path.shift(); return { ...target }; }
  if (amount <= 0) return { ...point };
  return { x: point.x + (target.x - point.x) * amount / length, z: point.z + (target.z - point.z) * amount / length };
}

/** The person owns a floor position; only a deliberate grip couples it to the board. */
export class BoardManager {
  private currentPhase: BoardManagerPhase = 'idle';
  phaseElapsed = 0;
  get phase() { return this.currentPhase; }
  set phase(next: BoardManagerPhase) {
    if (next !== this.currentPhase) { this.currentPhase = next; this.phaseElapsed = 0; }
  }
  position: Point;
  motion: Point = { x: 0, z: 0 };
  grip: Point = { x: 0, z: 0 };
  private path: Point[] = [];
  private boardPath: Point[] = [];
  private quiet = 0;
  private lastBoard: Point;
  private destination?: Point;
  private speed = 0;
  private noteTask?: BoardManagerNote;
  private queuedNote?: BoardManagerNote;
  private seenNote?: string;
  readonly idle: Point;

  constructor(readonly home: Point, readonly yaw: number) {
    this.idle = add(home, this.offset(.85, .54));
    this.position = { ...this.idle }; this.lastBoard = { ...home };
  }
  offset(x: number, z: number): Point {
    return { x: x * Math.cos(this.yaw) + z * Math.sin(this.yaw), z: z * Math.cos(this.yaw) - x * Math.sin(this.yaw) };
  }
  get holding() { return ['grabbing', 'returning', 'releasing'].includes(this.phase); }
  get taskName() { return this.noteTask?.label; }
  private observeNote(note: BoardManagerNote) {
    const id = note.id ?? `${note.x.toFixed(2)},${note.z.toFixed(2)}`;
    if (this.noteTask?.id === id) {
      if (this.phase !== 'writing') this.noteTask = { ...note, id };
    } else if (id !== this.seenNote) {
      this.seenNote = id;
      if (this.phase === 'writing') this.queuedNote = { ...note, id };
      else this.noteTask = { ...note, id };
    }
  }
  private travel(dt: number, point: Point, path: Point[], limit: number) {
    const length = path[0] ? distance(point, path[0]) : 0;
    const desired = Math.min(limit, Math.sqrt(2 * 4 * length));
    this.speed += Math.max(-5 * dt, Math.min(4 * dt, desired - this.speed));
    const count = path.length, next = advance(point, path, this.speed * dt);
    if (path.length < count) this.speed = 0;
    return next;
  }

  update(dt: number, board: Point, busy: boolean, available: boolean, note?: BoardManagerNote): Point | undefined {
    dt = Number.isFinite(dt) ? Math.min(.05, Math.max(0, dt)) : 0;
    this.motion = { x: 0, z: 0 };
    const moved = distance(board, this.lastBoard) > .001;
    this.lastBoard = { ...board };
    if (busy || moved) {
      this.phase = 'waiting'; this.quiet = 0; this.path = []; this.boardPath = []; this.destination = undefined;
      this.speed = 0; this.noteTask = this.queuedNote = undefined;
      return;
    }
    if (!available) return;
    this.phaseElapsed += dt;
    const displaced = distance(board, this.home) > .005;
    if (!displaced && !this.holding && note) this.observeNote(note);
    if (this.phase === 'waiting' || displaced && ['idle', 'writing', 'walking-home', 'walking-to-note'].includes(this.phase)) {
      this.phase = 'waiting'; this.quiet += dt;
      if (this.quiet < .9) return;
      if (displaced) {
        // Try the side handle first; front grip works when a wall blocks that side.
        for (const grip of [this.offset(.80, .23), this.offset(.05, .66), this.offset(-.80, -.23)]) {
          const boardPath = boardReturnPath(board, this.home, grip);
          const path = managerPath(this.position, add(board, grip), board);
          if (!boardPath || !path) continue;
          this.grip = grip; this.boardPath = boardPath; this.path = path;
          this.speed = 0;
          this.phase = 'approaching'; return;
        }
        this.quiet = 0; return;
      }
      this.phase = 'idle';
    }
    if (this.phase === 'grabbing' || this.phase === 'releasing') {
      this.quiet += dt;
      if (this.quiet >= .32) { this.phase = this.phase === 'grabbing' ? 'returning' : 'idle'; this.destination = undefined; }
      return;
    }
    if (this.phase === 'returning') {
      const next = this.travel(dt, board, this.boardPath, .85);
      const before = this.position; this.position = add(next, this.grip);
      this.motion = { x: this.position.x - before.x, z: this.position.z - before.z };
      this.lastBoard = { ...next };
      if (!this.boardPath.length) { this.phase = 'releasing'; this.quiet = 0; }
      return next;
    }
    if (this.phase === 'writing') {
      // Paper animations last less than a second. Finish the person's reach,
      // writing beat and arm-lowering even after that transient event disappears.
      if (this.phaseElapsed < 1.12) return;
      this.noteTask = this.queuedNote; this.queuedNote = undefined;
      this.destination = undefined; this.phase = 'idle';
    }
    if (this.phase !== 'approaching') {
      const target = this.noteTask ?? this.idle;
      if (!this.destination || distance(target, this.destination) > .05) {
        this.destination = { ...target };
        const path = managerPath(this.position, target, board);
        this.path = path ?? [];
        if (!path) { this.noteTask = undefined; this.destination = undefined; this.speed = 0; }
      }
      this.phase = this.path.length ? this.noteTask ? 'walking-to-note' : 'walking-home'
        : this.noteTask && distance(this.position, target) < .07 ? 'writing' : 'idle';
    }
    if (this.path.length) {
      const before = this.position;
      this.position = this.travel(dt, before, this.path, 1.15);
      this.motion = { x: this.position.x - before.x, z: this.position.z - before.z };
      if (!this.path.length && this.phase === 'approaching') { this.phase = 'grabbing'; this.quiet = 0; }
    }
  }
}

type Facing = 'left' | 'right' | 'up' | 'down';
/** Discrete sprites keep a continuous stride phase, including walking backwards
 * while pulling. Reversing a frame number at a corner changed feet instantly. */
export class BoardManagerAnimation {
  private facing: Facing = 'down';
  private stride = 1;
  private heldStride = 1;
  private heldDirection = 1;
  sample(manager: Pick<BoardManager, 'phase' | 'phaseElapsed' | 'holding' | 'grip' | 'motion'>, reduced = false) {
    const { motion, grip } = manager, distance = Math.hypot(motion.x, motion.z), walking = distance > .00001;
    if (manager.holding) {
      const facing: Facing = Math.abs(grip.x) > Math.abs(grip.z) ? grip.x > 0 ? 'left' : 'right' : grip.z > 0 ? 'up' : 'down';
      if (manager.phase === 'grabbing' && manager.phaseElapsed < .12 || manager.phase === 'releasing' && manager.phaseElapsed >= .16) {
        this.heldStride = 1; return { animation: `walk_${facing}`, frame: 1 };
      }
      if (walking && !reduced) {
        const projected = -(motion.x * grip.x + motion.z * grip.z);
        if (Math.abs(projected) > distance * Math.hypot(grip.x, grip.z) * .12) this.heldDirection = Math.sign(projected);
        this.heldStride = (this.heldStride + this.heldDirection * distance / AVATAR_FRAME_DISTANCE + 4) % 4;
      } else this.heldStride = 1;
      return { animation: `hold_${facing}`, frame: Math.floor(this.heldStride) };
    }
    this.heldStride = 1;
    if (walking) {
      const x = Math.abs(motion.x), z = Math.abs(motion.z);
      // Keep the previous heading near a diagonal boundary instead of rapidly
      // swapping a side profile and a front/back sprite as tiny deltas vary.
      const horizontal = x > z * 1.18 || x >= z / 1.18 && (this.facing === 'left' || this.facing === 'right');
      this.facing = horizontal ? motion.x > 0 ? 'right' : 'left' : motion.z > 0 ? 'down' : 'up';
      this.stride = reduced ? 0 : (this.stride + distance / AVATAR_FRAME_DISTANCE) % 4;
      return { animation: `walk_${this.facing}`, frame: Math.floor(this.stride) };
    }
    this.stride = 1;
    if (manager.phase === 'writing') {
      const writing = manager.phaseElapsed >= .16 && manager.phaseElapsed < .92;
      return { animation: writing ? 'board' : 'walk_up', frame: writing ? reduced ? 0 : Math.floor((manager.phaseElapsed - .16) * 4) % 2 : 1 };
    }
    return { animation: 'idle', frame: 0 };
  }
}
