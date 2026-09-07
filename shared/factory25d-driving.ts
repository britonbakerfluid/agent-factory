import { GARAGE_CAR_BAYS, GARAGE_CAR_IDS, GARAGE_CAR_YAW, type GarageCarId } from './factory25d-garage.js';
import { planGarageParking } from './factory25d-parking.js';
import { FACTORY_OBSTACLES, GARAGE_WORLD_Z } from './factory25d-layout.js';

export type GarageDriveInput = { throttle: number; steer: number; drift: boolean };
export type GarageDriveCar = {
  id: GarageCarId; x: number; z: number; yaw: number; vx: number; vz: number;
  steer: number; slip: number; throttle: number; damage: number;
  mode: 'parked' | 'driving' | 'returning' | 'donut';
  hoverHeight?: number;
  driverVisitorId?: string; driverSessionId?: string;
};
export type GarageTireMark = { id: number; car: GarageCarId; x1: number; z1: number; x2: number; z2: number; width: number; opacity: number; createdAt: number };
export type GarageDrivePedestrian = { x: number; z: number; radius?: number; toX?: number; toZ?: number; sessionId?: string };
export type GarageDriveRequest = { type: 'garage_drive'; action: 'claim' | 'input' | 'release' | 'reset'; car: GarageCarId; input?: GarageDriveInput };
export type GarageDriveResult = { type: 'garage_drive_result'; action: GarageDriveRequest['action']; car: GarageCarId; success: boolean; visitorId?: string; error?: string };
export type GarageDriveState = { type: 'garage_drive_state'; serverTime: number; cars: GarageDriveCar[]; marks: GarageTireMark[]; replaceMarks: boolean };
export const GARAGE_MAX_MARKS = 240;
export const GARAGE_MARK_LIFETIME_MS = 90_000;
export const GARAGE_HOVER_HEIGHT = 1.45;
export const GARAGE_RETURN_RECOVERY_MS = 1_000;
export const GARAGE_NEUTRAL_INPUT: GarageDriveInput = { throttle: 0, steer: 0, drift: false };
export const GARAGE_DRIVE_PROFILES = {
  porsche: { height: .804, width: 1.074, length: 2.052, acceleration: 5.6, braking: 9, maxSpeed: 6.8, mass: 1.15, grip: 10, driftGrip: 1.5, steering: .66, wheelbase: 1.36 },
  mini: { height: .878, width: .897, length: 1.620, acceleration: 4.5, braking: 8, maxSpeed: 5.7, mass: .82, grip: 9, driftGrip: 1.8, steering: .78, wheelbase: 1.06 },
  delorean: { height: .744, width: 1.104, length: 2.091, acceleration: 3.8, braking: 7, maxSpeed: 6.1, mass: 1.4, grip: 8, driftGrip: 1.2, steering: .58, wheelbase: 1.4 },
  f1: { height: .739, width: 1.382, length: 2.299, acceleration: 7.2, braking: 12, maxSpeed: 8, mass: .65, grip: 14, driftGrip: 2.2, steering: .61, wheelbase: 1.55 },
} as const;
type Point = { x: number; z: number };
type Pose = Point & { yaw: number };
type Box = { left: number; right: number; near: number; far: number };
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
// The current ramp has no finished exterior. Keep its entire footprint closed.
export const GARAGE_DRIVE_OBSTACLES: readonly Box[] = FACTORY_OBSTACLES.filter(o => o.near > 18
  && !GARAGE_CAR_IDS.some(id => { const p = GARAGE_CAR_BAYS[id]; return p.x > o.left && p.x < o.right && p.z + GARAGE_WORLD_Z > o.near && p.z + GARAGE_WORLD_Z < o.far; }))
  .map(o => ({ ...o, near: o.near - GARAGE_WORLD_Z, far: o.far - GARAGE_WORLD_Z }))
  .concat([
    // Full authored front-row envelope: workbench, stool, cabinets, coffee
    // stop and seats extend beyond the narrower pedestrian station markers.
    { left: -11.8, right: 4.2, near: 11.6, far: 13.8 },
    ...[-6.3, -2.1, 2.1, 6.3].map(x => ({ left: x - 1.1, right: x + 1.1, near: -3.6, far: -2.18 })),
  ]);

export function validGarageDriveInput(value: unknown): value is GarageDriveInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as GarageDriveInput;
  return Number.isFinite(v.throttle) && Math.abs(v.throttle) <= 1 && Number.isFinite(v.steer) && Math.abs(v.steer) <= 1 && typeof v.drift === 'boolean';
}
export function garageCarHull(car: Pick<GarageDriveCar, 'id' | 'x' | 'z' | 'yaw' | 'hoverHeight'>, margin = .14): Point[] {
  const p = GARAGE_DRIVE_PROFILES[car.id];
  const width = car.id === 'delorean' ? p.width + .366 * clamp((car.hoverHeight ?? 0) / 1.1, 0, 1) : p.width;
  const w = width / 2 + margin, l = p.length / 2 + margin;
  return [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, z]) => ({ x: car.x + x * Math.cos(car.yaw) + z * Math.sin(car.yaw), z: car.z - x * Math.sin(car.yaw) + z * Math.cos(car.yaw) }));
}
function overlap(a: Point[], b: Point[]) {
  let al = Infinity, ar = -Infinity, an = Infinity, af = -Infinity;
  let bl = Infinity, br = -Infinity, bn = Infinity, bf = -Infinity;
  for (const p of a) { al = Math.min(al, p.x); ar = Math.max(ar, p.x); an = Math.min(an, p.z); af = Math.max(af, p.z); }
  for (const p of b) { bl = Math.min(bl, p.x); br = Math.max(br, p.x); bn = Math.min(bn, p.z); bf = Math.max(bf, p.z); }
  if (ar <= bl || br <= al || af <= bn || bf <= an) return false;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], nx = q.z - p.z, nz = p.x - q.x;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of a) { const d = p.x * nx + p.z * nz; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const p of b) { const d = p.x * nx + p.z * nz; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}
function boxHull(b: Box): Point[] { return [{ x: b.left, z: b.near }, { x: b.right, z: b.near }, { x: b.right, z: b.far }, { x: b.left, z: b.far }]; }
const obstacleHulls = GARAGE_DRIVE_OBSTACLES.map(boxHull);
/** Swept pedestrian capsule against a car's expanded rectangle. */
export function garageCarBlocksSegment(car: GarageDriveCar, from: Point, to: Point, radius = .28): boolean {
  if ((car.hoverHeight ?? 0) >= 1.25) return false;
  const p = GARAGE_DRIVE_PROFILES[car.id];
  const local = (v: Point) => ({ x: (v.x - car.x) * Math.cos(car.yaw) - (v.z - car.z) * Math.sin(car.yaw), z: (v.x - car.x) * Math.sin(car.yaw) + (v.z - car.z) * Math.cos(car.yaw) });
  const a = local(from), b = local(to), extents = [p.width / 2 + radius, p.length / 2 + radius];
  let lo = 0, hi = 1;
  for (const [i, key] of (['x', 'z'] as const).entries()) {
    const d = b[key] - a[key], e = extents[i];
    if (Math.abs(d) < 1e-9) { if (Math.abs(a[key]) > e) return false; }
    else { const t1 = (-e - a[key]) / d, t2 = (e - a[key]) / d; lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2)); if (lo > hi) return false; }
  }
  return true;
}

/** Pure, bounded shared simulation: inputs never supply a car pose or velocity. */
export class GarageDrivingSimulation {
  readonly cars: GarageDriveCar[] = GARAGE_CAR_IDS.map(id => ({ id, ...GARAGE_CAR_BAYS[id], yaw: GARAGE_CAR_YAW, vx: 0, vz: 0, steer: 0, slip: 0, throttle: 0, damage: 0, mode: 'parked' }));
  readonly marks: GarageTireMark[] = [];
  private inputs = new Map<GarageCarId, GarageDriveInput>();
  private routes = new Map<GarageCarId, { points: Pose[]; index: number }>();
  private parkingSpeeds = new Map<GarageCarId, number>();
  private tires = new Map<GarageCarId, Point[]>();
  private donuts = new Map<GarageCarId, { startedAt?: number; circleAt?: number }>();
  private returnStalls = new Map<GarageCarId, { recoverAt: number }>();
  private pedestrians: GarageDrivePedestrian[] = [];
  private nextMark = 1;
  car(id: GarageCarId) { return this.cars.find(car => car.id === id)!; }
  claim(id: GarageCarId, visitorId: string, driverSessionId?: string): boolean {
    const car = this.car(id);
    if (!car || car.mode !== 'parked' && !(car.mode === 'returning' && car.driverVisitorId === visitorId)) return false;
    // Validate first, then hand off atomically: a rejected switch never drops the old car.
    for (const previous of this.cars) if (previous.id !== id && previous.driverVisitorId === visitorId && previous.mode === 'driving') this.release(previous.id);
    this.routes.delete(id); this.returnStalls.delete(id); this.parkingSpeeds.delete(id);
    car.mode = 'driving'; car.driverVisitorId = visitorId; car.driverSessionId = driverSessionId;
    this.inputs.set(id, { ...GARAGE_NEUTRAL_INPUT }); return true;
  }
  startDonut(id: GarageCarId, driverSessionId: string): boolean {
    if (!this.claim(id, `agent:${driverSessionId}`, driverSessionId)) return false;
    this.car(id).mode = 'donut'; this.donuts.set(id, {}); return true;
  }
  setInput(id: GarageCarId, input: GarageDriveInput) { if (validGarageDriveInput(input) && this.car(id)?.mode === 'driving') this.inputs.set(id, { ...input }); }
  release(id: GarageCarId) {
    const car = this.car(id); if (!car || car.mode === 'parked') return;
    if (car.mode !== 'returning') { this.returnStalls.delete(id); this.routes.delete(id); this.parkingSpeeds.set(id, 0); }
    car.mode = 'returning'; car.vx = car.vz = car.throttle = car.steer = car.slip = 0;
    this.inputs.delete(id); this.tires.delete(id); this.donuts.delete(id);
  }
  reset(id: GarageCarId): boolean {
    const car = this.car(id); if (!car) return false;
    const target = { ...car, ...GARAGE_CAR_BAYS[id], yaw: GARAGE_CAR_YAW, hoverHeight: 0 };
    if (this.blocker(target)) { this.release(id); return false; }
    this.park(car); return true;
  }
  private park(car: GarageDriveCar) {
    Object.assign(car, GARAGE_CAR_BAYS[car.id], { yaw: GARAGE_CAR_YAW, vx: 0, vz: 0, steer: 0, slip: 0, throttle: 0, damage: 0, hoverHeight: 0, mode: 'parked' });
    delete car.driverVisitorId; delete car.driverSessionId;
    this.routes.delete(car.id); this.parkingSpeeds.delete(car.id); this.inputs.delete(car.id); this.tires.delete(car.id); this.donuts.delete(car.id);
    this.returnStalls.delete(car.id);
  }
  private blocker(car: GarageDriveCar, clearance = 0): 'scene' | 'pedestrian' | GarageDriveCar | undefined {
    const hull = garageCarHull(car, .14 + clearance);
    if (hull.some(p => p.x < -11.8 || p.x > 11.8 || p.z < -4.3 || p.z > 16)
      || obstacleHulls.some(o => overlap(hull, o))) return 'scene';
    const low = (car.hoverHeight ?? 0) - (car.id === 'delorean' ? .065 : 0);
    const high = (car.hoverHeight ?? 0) + GARAGE_DRIVE_PROFILES[car.id].height;
    const other = this.cars.find(other => other.id !== car.id
      && low < (other.hoverHeight ?? 0) + GARAGE_DRIVE_PROFILES[other.id].height + .14
      && high + .14 > (other.hoverHeight ?? 0) - (other.id === 'delorean' ? .065 : 0)
      && overlap(hull, garageCarHull(other)));
    if (other) return other;
    if (this.pedestrians.some(p => (!p.sessionId || p.sessionId !== car.driverSessionId) && garageCarBlocksSegment(car, p, { x: p.toX ?? p.x, z: p.toZ ?? p.z }, p.radius ?? .32))) return 'pedestrian';
  }
  isClear(car: GarageDriveCar) { return !this.blocker(car); }
  snapshot(now: number): GarageDriveState { return { type: 'garage_drive_state', serverTime: now, cars: this.cars.map(c => ({ ...c })), marks: this.marks.map(m => ({ ...m })), replaceMarks: true }; }
  step(dt: number, now: number, pedestrians: GarageDrivePedestrian[] = []) {
    if (!Number.isFinite(dt) || !Number.isFinite(now) || dt <= 0) return;
    this.pedestrians = pedestrians.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
    const total = Math.min(.1, dt), steps = Math.ceil(total / (1 / 120)), h = total / steps;
    for (let i = 0; i < steps; i++) for (const car of this.cars) {
      if (car.mode === 'parked') continue;
      if (car.mode === 'returning') { this.returnStep(car, h, now); continue; }
      if (car.id === 'delorean') {
        car.hoverHeight = Math.min(GARAGE_HOVER_HEIGHT, (car.hoverHeight ?? 0) + h * 1.6);
        if (car.hoverHeight < GARAGE_HOVER_HEIGHT) { car.vx = car.vz = car.throttle = 0; continue; }
      }
      let input = this.inputs.get(car.id) ?? GARAGE_NEUTRAL_INPUT;
      if (car.mode === 'donut') {
        const d = this.donuts.get(car.id)!; d.startedAt ??= now;
        if (car.z >= 7.8) d.circleAt ??= now;
        if (now - d.startedAt > 20_000 || d.circleAt !== undefined && now - d.circleAt > 6_500) { this.release(car.id); continue; }
        input = d.circleAt === undefined ? { throttle: -.72, steer: 0, drift: false } : { throttle: .6, steer: 1, drift: true };
      }
      this.driveStep(car, input, h, now);
    }
    while (this.marks.length > GARAGE_MAX_MARKS || this.marks[0] && now - this.marks[0].createdAt > GARAGE_MARK_LIFETIME_MS) this.marks.shift();
  }
  private driveStep(car: GarageDriveCar, input: GarageDriveInput, dt: number, now: number) {
    const p = GARAGE_DRIVE_PROFILES[car.id], before = { ...car }, fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let forward = car.vx * fx + car.vz * fz, sideways = car.vx * fz - car.vz * fx;
    car.steer += (input.steer * p.steering - car.steer) * (1 - Math.exp(-9 * dt));
    const braking = input.throttle * forward < -.1;
    forward += input.throttle * (braking ? p.braking : p.acceleration * (1 - car.damage * .4)) * dt;
    forward *= Math.exp(-(input.throttle ? .25 : 3) * dt);
    forward = clamp(forward, -2.8, p.maxSpeed * (1 - car.damage * .3));
    sideways *= Math.exp(-(input.drift ? p.driftGrip : p.grip) * dt);
    car.yaw = angle(car.yaw + forward / p.wheelbase * Math.tan(car.steer) * dt);
    // Retain lateral momentum while the body turns, producing readable drift.
    car.vx = fx * forward + fz * sideways; car.vz = fz * forward - fx * sideways;
    car.x += car.vx * dt; car.z += car.vz * dt; car.throttle = input.throttle;
    const hit = this.blocker(car);
    if (hit) {
      const impact = Math.hypot(car.vx, car.vz); Object.assign(car, { x: before.x, z: before.z, yaw: before.yaw, vx: 0, vz: 0, slip: 0 });
      if (hit !== 'pedestrian' && impact > 1.1) {
        car.damage = clamp(car.damage + impact * impact * p.mass * .008, 0, 1);
        if (typeof hit === 'object') hit.damage = clamp(hit.damage + impact * impact * p.mass * .006 / GARAGE_DRIVE_PROFILES[hit.id].mass, 0, 1);
      }
      this.tires.delete(car.id); return;
    }
    car.slip = Math.atan2(car.vx * Math.cos(car.yaw) - car.vz * Math.sin(car.yaw), Math.abs(car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw)) + .2);
    if ((car.hoverHeight ?? 0) > .1 || !input.drift || Math.abs(car.slip) < .065 || Math.hypot(car.vx, car.vz) < .9) { this.tires.delete(car.id); return; }
    const tires = [-1, 1].map(side => ({ x: car.x - Math.sin(car.yaw) * p.length * .32 + Math.cos(car.yaw) * p.width * .38 * side,
      z: car.z - Math.cos(car.yaw) * p.length * .32 - Math.sin(car.yaw) * p.width * .38 * side }));
    const previous = this.tires.get(car.id);
    if (previous && Math.hypot(tires[0].x - previous[0].x, tires[0].z - previous[0].z) < .12) return;
    const width = car.id === 'f1' ? .11 : car.id === 'mini' ? .075 : .085;
    if (previous) tires.forEach((point, i) => this.marks.push({ id: this.nextMark++, car: car.id, x1: previous[i].x, z1: previous[i].z, x2: point.x, z2: point.z, width, opacity: clamp(.35 + Math.abs(car.slip) * .7, .35, .8), createdAt: now }));
    this.tires.set(car.id, tires);
  }
  private returnStep(car: GarageDriveCar, dt: number, now: number) {
    const bay = { ...GARAGE_CAR_BAYS[car.id], yaw: GARAGE_CAR_YAW };
    const atBay = Math.hypot(car.x - bay.x, car.z - bay.z) < .008 && Math.abs(angle(car.yaw - bay.yaw)) < .008;
    if (atBay) {
      car.vx = car.vz = car.throttle = car.steer = 0;
      // A flying car waits above an occupied landing; never lower through a car or person.
      if (this.blocker({ ...car, ...bay, hoverHeight: 0 })) return;
      car.hoverHeight = Math.max(0, (car.hoverHeight ?? 0) - dt * 1.1);
      if (!car.hoverHeight) this.park(car);
      return;
    }
    if (car.id === 'delorean') {
      car.hoverHeight = Math.min(GARAGE_HOVER_HEIGHT, (car.hoverHeight ?? 0) + dt * 1.6);
      if (car.hoverHeight < GARAGE_HOVER_HEIGHT) return;
    }
    let route = this.routes.get(car.id);
    if (!route) {
      const retry = this.returnStalls.get(car.id);
      if (retry && now < retry.recoverAt) return;
      const origin = { x: car.x, z: car.z };
      // A car may request parking while resting against a wall. Grow the
      // planner's extra padding as it pulls away instead of rejecting its start.
      const points = planGarageParking(car, bay, pose => !this.blocker({ ...car, ...pose },
        .025 * Math.min(1, Math.hypot(pose.x - origin.x, pose.z - origin.z) / .35)), { flying: car.id === 'delorean' });
      if (!points?.length) { this.returnStalls.set(car.id, { recoverAt: now + GARAGE_RETURN_RECOVERY_MS }); return; }
      route = { points, index: 0 }; this.routes.set(car.id, route); this.returnStalls.delete(car.id);
    }
    const remaining = Math.hypot(car.x - bay.x, car.z - bay.z);
    const desiredSpeed = Math.min(4.2, Math.max(.45, remaining * 2));
    const speed = Math.min(desiredSpeed, (this.parkingSpeeds.get(car.id) ?? 0) + 5 * dt);
    this.parkingSpeeds.set(car.id, speed);
    const before = { x: car.x, z: car.z, yaw: car.yaw };
    let budget = speed * dt;
    // Consume the remainder at each waypoint so tessellation doesn't dictate
    // speed or cause a tiny brake pulse at every arc sample.
    for (let visited = 0; visited < 8 && route.index < route.points.length && budget > 0; visited++) {
      const target = route.points[route.index], dx = target.x - car.x, dz = target.z - car.z;
      const yawDelta = angle(target.yaw - car.yaw), span = Math.max(Math.hypot(dx, dz), Math.abs(yawDelta) * .6, .000001);
      const t = Math.min(1, budget / span);
      const next = { ...car, x: car.x + dx * t, z: car.z + dz * t, yaw: angle(car.yaw + yawDelta * t) };
      if (this.blocker(next)) {
        car.vx = car.vz = car.throttle = car.steer = 0; this.parkingSpeeds.set(car.id, 0);
        this.routes.delete(car.id); this.returnStalls.set(car.id, { recoverAt: now + 500 }); return;
      }
      car.x = next.x; car.z = next.z; car.yaw = next.yaw; budget -= span * t;
      if (t === 1) route.index++;
    }
    car.vx = (car.x - before.x) / dt; car.vz = (car.z - before.z) / dt;
    const forward = car.vx * Math.sin(car.yaw) + car.vz * Math.cos(car.yaw);
    car.steer = Math.abs(forward) > .01 ? clamp(Math.atan(angle(car.yaw - before.yaw) / dt * GARAGE_DRIVE_PROFILES[car.id].wheelbase / forward), -.7, .7) : 0;
    car.throttle = Math.sign(forward) * Math.min(.65, speed / 5);
    if (route.index >= route.points.length) this.routes.delete(car.id);
  }
}
