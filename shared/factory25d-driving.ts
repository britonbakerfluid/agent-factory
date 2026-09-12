import { GARAGE_CAR_BAYS, GARAGE_CAR_IDS, GARAGE_CAR_YAW, GARAGE_RAMP, garageRampHeightAt, type GarageCarId } from './factory25d-garage.js';
import { planGarageParking } from './factory25d-parking.js';
import { clearFactorySegment, FACTORY_OBSTACLES, GARAGE_WORLD_Z } from './factory25d-layout.js';

export type GarageDriveInput = { throttle: number; steer: number; drift: boolean; celebrate?: boolean };
export type GarageTimeJump = { id: number; startedAt: number; arriveAt: number; arrived: boolean; x: number; z: number; yaw: number };
export type GarageDriveCar = {
  id: GarageCarId; x: number; z: number; yaw: number; vx: number; vz: number;
  steer: number; slip: number; throttle: number; damage: number;
  mode: 'parked' | 'driving' | 'returning' | 'donut';
  hoverHeight?: number;
  celebration?: { startedAt: number; turn: number };
  timeJump?: GarageTimeJump;
  driverVisitorId?: string; driverSessionId?: string;
};
export type GarageTireMark = { id: number; car: GarageCarId; x1: number; z1: number; x2: number; z2: number; width: number; opacity: number; createdAt: number; kind?: 'fire'; y1?: number; y2?: number };
export type GarageDrivePedestrian = { x: number; z: number; radius?: number; toX?: number; toZ?: number; sessionId?: string; pushable?: boolean };
export type GaragePedestrianPush = { sessionId: string; x: number; z: number; fromX: number; fromZ: number };
export type GarageDriveRequest = { type: 'garage_drive'; action: 'claim' | 'input' | 'release' | 'reset'; car: GarageCarId; input?: GarageDriveInput };
export type GarageDriveResult = { type: 'garage_drive_result'; action: GarageDriveRequest['action']; car: GarageCarId; success: boolean; visitorId?: string; error?: string };
export type GarageDriveState = { type: 'garage_drive_state'; serverTime: number; cars: GarageDriveCar[]; marks: GarageTireMark[]; replaceMarks: boolean };
export const GARAGE_MAX_MARKS = 240;
export const GARAGE_MARK_LIFETIME_MS = 90_000;
export const GARAGE_HOVER_HEIGHT = 1.45;
export const GARAGE_TIME_JUMP_DELAY_MS = 550;
export const GARAGE_FIRE_LIFETIME_MS = 8_000;
export const GARAGE_RETURN_RECOVERY_MS = 1_000;
export const GARAGE_REPAIR_DELAY_SECONDS = 4;
export const GARAGE_FULL_REPAIR_SECONDS = 60;
export const GARAGE_NEUTRAL_INPUT: GarageDriveInput = { throttle: 0, steer: 0, drift: false };
export const GARAGE_DRIVE_PROFILES = {
  porsche: { height: .804, width: 1.074, length: 2.052, acceleration: 13.5, braking: 15, maxSpeed: 13.5, reverseSpeed: 5.2, mass: 1.15, grip: 10, driftGrip: 1.5, steering: .66, wheelbase: 1.36 },
  mini: { height: .878, width: .897, length: 1.620, acceleration: 10.8, braking: 12.5, maxSpeed: 11.2, reverseSpeed: 4.8, mass: .82, grip: 9, driftGrip: 1.8, steering: .78, wheelbase: 1.06 },
  delorean: { height: .744, width: 1.104, length: 2.091, acceleration: 10, braking: 12, maxSpeed: 12.4, reverseSpeed: 5.4, mass: 1.4, grip: 8, driftGrip: 1.2, steering: .58, wheelbase: 1.4 },
  f1: { height: .739, width: 1.382, length: 2.299, acceleration: 17.5, braking: 20, maxSpeed: 16, reverseSpeed: 4.6, mass: .65, grip: 14, driftGrip: 2.2, steering: .61, wheelbase: 1.55 },
} as const;
// Autonomous breaks keep their rehearsed, slower courtyard maneuver.
const IDLE_ACCELERATION = { porsche: 5.6, mini: 4.5, delorean: 3.8, f1: 7.2 };
const IDLE_BRAKING = { porsche: 9, mini: 8, delorean: 7, f1: 12 };
const IDLE_MAX_SPEED = { porsche: 9.5, mini: 7.8, delorean: 8.8, f1: 11.5 };
type Point = { x: number; z: number };
type Pose = Point & { yaw: number };
type Box = { left: number; right: number; near: number; far: number; ramp?: boolean };
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
// Ground cars stop at the barrier. Only the airborne DeLorean can use this exit.
export const GARAGE_DRIVE_OBSTACLES: readonly Box[] = FACTORY_OBSTACLES.filter(o => o.near > 18
  && !GARAGE_CAR_IDS.some(id => { const p = GARAGE_CAR_BAYS[id]; return p.x > o.left && p.x < o.right && p.z + GARAGE_WORLD_Z > o.near && p.z + GARAGE_WORLD_Z < o.far; }))
  .map<Box>(o => ({ ...o, near: o.near - GARAGE_WORLD_Z, far: o.far - GARAGE_WORLD_Z, ramp: o.id === 'garage-ramp' }))
  .concat([
    // Full authored front-row envelope: workbench, stool, cabinets, coffee
    // stop and seats extend beyond the narrower pedestrian station markers.
    { left: -11.8, right: 4.2, near: 11.6, far: 13.8 },
    ...[-6.3, -2.1, 2.1, 6.3].map(x => ({ left: x - 1.1, right: x + 1.1, near: -3.6, far: -2.18 })),
  ]);

export function validGarageDriveInput(value: unknown): value is GarageDriveInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as GarageDriveInput;
  return Number.isFinite(v.throttle) && Math.abs(v.throttle) <= 1 && Number.isFinite(v.steer) && Math.abs(v.steer) <= 1 && typeof v.drift === 'boolean' && (v.celebrate === undefined || typeof v.celebrate === 'boolean');
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
/** Smallest separating translation, oriented from the first body toward the second. */
function contact(a: Point[], b: Point[]): (Point & { depth: number }) | undefined {
  let best: (Point & { depth: number }) | undefined;
  const center = (points: Point[]) => points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, z: sum.z + p.z / points.length }), { x: 0, z: 0 });
  const ac = center(a), bc = center(b);
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], length = Math.hypot(q.z - p.z, p.x - q.x);
    let x = (q.z - p.z) / length, z = (p.x - q.x) / length;
    if ((bc.x - ac.x) * x + (bc.z - ac.z) * z < 0) { x = -x; z = -z; }
    const ap = a.map(p => p.x * x + p.z * z), bp = b.map(p => p.x * x + p.z * z);
    const depth = Math.max(...ap) - Math.min(...bp);
    if (depth <= 0 || Math.max(...bp) <= Math.min(...ap)) return;
    if (!best || depth < best.depth) best = { x, z, depth };
  }
  return best;
}
function boxHull(b: Box): Point[] { return [{ x: b.left, z: b.near }, { x: b.right, z: b.near }, { x: b.right, z: b.far }, { x: b.left, z: b.far }]; }
const obstacleHulls = GARAGE_DRIVE_OBSTACLES.map(box => ({ box, hull: boxHull(box) }));
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
  private celebrationLatch = new Set<GarageCarId>();
  private inputs = new Map<GarageCarId, GarageDriveInput>();
  private routes = new Map<GarageCarId, { points: Pose[]; index: number }>();
  private parkingSpeeds = new Map<GarageCarId, number>();
  private tires = new Map<GarageCarId, Point[]>();
  private donuts = new Map<GarageCarId, { startedAt?: number; circleAt?: number }>();
  private returnStalls = new Map<GarageCarId, { recoverAt: number }>();
  private repairTime = new Map<GarageCarId, number>();
  private pedestrians: GarageDrivePedestrian[] = [];
  readonly pedestrianPushes: GaragePedestrianPush[] = [];
  private shoved = new Set<GarageCarId>();
  private nextMark = 1;
  private nextJump = 1;
  car(id: GarageCarId) { return this.cars.find(car => car.id === id)!; }
  claim(id: GarageCarId, visitorId: string, driverSessionId?: string): boolean {
    const car = this.car(id);
    if (car?.timeJump && !car.timeJump.arrived) return false;
    if (!car || car.mode !== 'parked' && !(car.mode === 'returning' && car.driverVisitorId === visitorId)) return false;
    // Validate first, then hand off atomically: a rejected switch never drops the old car.
    for (const previous of this.cars) if (previous.id !== id && previous.driverVisitorId === visitorId && previous.mode === 'driving') this.release(previous.id);
    this.routes.delete(id); this.returnStalls.delete(id); this.parkingSpeeds.delete(id);
    car.mode = 'driving'; car.driverVisitorId = visitorId; car.driverSessionId = driverSessionId;
    this.repairTime.delete(id); this.shoved.delete(id);
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
    delete car.celebration; this.celebrationLatch.delete(id);
    car.mode = 'returning'; car.vx = car.vz = car.throttle = car.steer = car.slip = 0;
    this.inputs.delete(id); this.tires.delete(id); this.donuts.delete(id);
  }
  reset(id: GarageCarId): boolean {
    const car = this.car(id); if (!car) return false;
    if (car.timeJump && !car.timeJump.arrived) return false;
    const target = { ...car, ...GARAGE_CAR_BAYS[id], yaw: GARAGE_CAR_YAW, hoverHeight: 0 };
    if (this.blocker(target)) { this.release(id); return false; }
    this.park(car); return true;
  }
  private park(car: GarageDriveCar) {
    delete car.celebration; this.celebrationLatch.delete(car.id);
    Object.assign(car, GARAGE_CAR_BAYS[car.id], { yaw: GARAGE_CAR_YAW, vx: 0, vz: 0, steer: 0, slip: 0, throttle: 0, hoverHeight: 0, mode: 'parked' });
    delete car.driverVisitorId; delete car.driverSessionId;
    this.routes.delete(car.id); this.parkingSpeeds.delete(car.id); this.inputs.delete(car.id); this.tires.delete(car.id); this.donuts.delete(car.id);
    this.returnStalls.delete(car.id); this.shoved.delete(car.id);
  }
  private blocker(car: GarageDriveCar, clearance = 0, ignored = new Set<GarageCarId>()): 'scene' | 'pedestrian' | GarageDriveCar | undefined {
    const hull = garageCarHull(car, .14 + clearance);
    const flying = car.id === 'delorean' && (car.hoverHeight ?? 0) >= 1.25;
    const throughDoor = (p: Point) => flying && p.x >= GARAGE_RAMP.left && p.x <= GARAGE_RAMP.right && p.z >= -5.6;
    if (hull.some(p => p.x < -11.8 || p.x > 11.8 || (p.z < -4.3 && !throughDoor(p)) || p.z > 16)
      || obstacleHulls.some(o => !(flying && o.box.ramp) && overlap(hull, o.hull))) return 'scene';
    const low = (car.hoverHeight ?? 0) - (car.id === 'delorean' ? .065 : 0);
    const high = (car.hoverHeight ?? 0) + GARAGE_DRIVE_PROFILES[car.id].height;
    const other = this.cars.find(other => other.id !== car.id && !ignored.has(other.id)
      && low < (other.hoverHeight ?? 0) + GARAGE_DRIVE_PROFILES[other.id].height + .14
      && high + .14 > (other.hoverHeight ?? 0) - (other.id === 'delorean' ? .065 : 0)
      && overlap(hull, garageCarHull(other)));
    if (other) return other;
    if (this.pedestrians.some(p => (!p.sessionId || p.sessionId !== car.driverSessionId) && garageCarBlocksSegment(car, p, p.pushable ? p : { x: p.toX ?? p.x, z: p.toZ ?? p.z }, p.radius ?? .32))) return 'pedestrian';
  }
  isClear(car: GarageDriveCar) { return !this.blocker(car); }
  snapshot(now: number): GarageDriveState { return { type: 'garage_drive_state', serverTime: now, cars: this.cars.map(c => ({ ...c })), marks: this.marks.map(m => ({ ...m })), replaceMarks: true }; }
  step(dt: number, now: number, pedestrians: GarageDrivePedestrian[] = []) {
    if (!Number.isFinite(dt) || !Number.isFinite(now) || dt <= 0) return;
    this.pedestrianPushes.length = 0;
    this.pedestrians = pedestrians.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)).map(p => ({ ...p }));
    const pedestrianOrigins = this.pedestrians.map(p => ({ ...p }));
    const total = Math.min(.1, dt), steps = Math.ceil(total / (1 / 120)), h = total / steps;
    for (let i = 0; i < steps; i++) for (const car of this.cars) {
      if (car.timeJump && !car.timeJump.arrived) {
        if (now < car.timeJump.arriveAt) continue;
        car.timeJump = { ...car.timeJump, arrived: true };
        Object.assign(car, GARAGE_CAR_BAYS[car.id], { yaw: GARAGE_CAR_YAW, hoverHeight: GARAGE_HOVER_HEIGHT, vx: 0, vz: 0 });
        this.fireTracks(car, now, 3.2);
      }
      if (car.timeJump && now - car.timeJump.arriveAt > GARAGE_FIRE_LIFETIME_MS) delete car.timeJump;
      if (car.mode === 'parked') {
        if (Math.hypot(car.vx, car.vz) > 0) { this.coastStep(car, h); continue; }
        if (car.damage > 0) {
          const quiet = (this.repairTime.get(car.id) ?? 0) + h;
          this.repairTime.set(car.id, quiet);
          if (quiet > GARAGE_REPAIR_DELAY_SECONDS) car.damage = Math.max(0, car.damage - h / GARAGE_FULL_REPAIR_SECONDS);
          if (!car.damage) this.repairTime.delete(car.id);
        }
        continue;
      }
      if (car.mode === 'returning' && this.shoved.has(car.id)) { this.coastStep(car, h); continue; }
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
        input = d.circleAt === undefined ? { throttle: -.72, steer: 0, drift: false } : { throttle: .6, steer: -1, drift: true };
      }
      this.driveStep(car, input, h, now);
    }
    this.pedestrians.forEach((p, i) => {
      const from = pedestrianOrigins[i];
      if (p.sessionId && (p.x !== from.x || p.z !== from.z)) this.pedestrianPushes.push({ sessionId: p.sessionId, x: p.x, z: p.z, fromX: from.x, fromZ: from.z });
    });
    while (this.marks.length > GARAGE_MAX_MARKS || this.marks[0] && now - this.marks[0].createdAt > GARAGE_MARK_LIFETIME_MS) this.marks.shift();
  }
  private driveStep(car: GarageDriveCar, input: GarageDriveInput, dt: number, now: number) {
    if (!input.celebrate) this.celebrationLatch.delete(car.id);
    if (input.celebrate && !this.celebrationLatch.has(car.id) && !car.celebration) {
      this.celebrationLatch.add(car.id); car.celebration = {startedAt:now,turn:0};
    }
    if (car.celebration) {
      if (now-car.celebration.startedAt < 5000) {
        // MVP celebration stays anchored; throttle never leaks into driving physics.
        car.vx=car.vz=car.slip=0; car.throttle=0; car.steer=input.steer;
        if(now-car.celebration.startedAt < 4200) car.celebration = {...car.celebration,turn:car.celebration.turn+input.steer*dt*2.6};
        return;
      }
      delete car.celebration;
    }
    const p = GARAGE_DRIVE_PROFILES[car.id], before = { ...car }, fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    let forward = car.vx * fx + car.vz * fz, sideways = car.vx * fz - car.vz * fx;
    const autonomous = car.mode === 'donut';
    const flying = car.id === 'delorean' && !autonomous && (car.hoverHeight ?? 0) >= 1.25;
    const speed = Math.abs(forward), topSpeed = (autonomous ? IDLE_MAX_SPEED[car.id] : p.maxSpeed) * (1 - car.damage * .4);
    // Smaller steering angles at speed keep a key press from snapping the car
    // sideways. Tire grip, rather than a rotation tween, catches the body.
    const steeringLimit = p.steering / (1 + (autonomous ? 0 : speed * speed * .022));
    // The cars face local +Z: a driver's right turn is negative world yaw.
    car.steer += (-input.steer * steeringLimit - car.steer) * (1 - Math.exp(-(autonomous ? 9 : 7) * dt));
    const braking = input.throttle * forward < -.1;
    const acceleration = autonomous ? IDLE_ACCELERATION[car.id] : p.acceleration * (1 - .35 * clamp(speed / topSpeed, 0, 1));
    forward += input.throttle * (braking ? autonomous ? IDLE_BRAKING[car.id] : p.braking : acceleration * (1 - car.damage * .55)) * dt;
    if (autonomous) forward *= Math.exp(-(input.throttle ? .25 : 3) * dt);
    else {
      // Rolling resistance + air drag allow coasting. Brakes remain much
      // stronger, and releasing the throttle no longer feels like a handbrake.
      const resistance = (flying ? .06 + forward * forward * .003 : .25 + forward * forward * .009 + (input.drift ? .7 : 0)) * dt;
      forward = Math.sign(forward) * Math.max(0, Math.abs(forward) - resistance);
    }
    forward = clamp(forward, -(autonomous ? 2.8 : p.reverseSpeed), topSpeed);
    sideways *= Math.exp(-(flying ? input.drift ? .16 : .65 : input.drift ? p.driftGrip : p.grip) * dt);
    const yawRate = flying ? car.steer / p.steering * (.65 + Math.min(10, speed) * .15) : forward / p.wheelbase * Math.tan(car.steer);
    car.yaw = angle(car.yaw + yawRate * dt);
    // Retain lateral momentum while the body turns, producing readable drift.
    car.vx = fx * forward + fz * sideways; car.vz = fz * forward - fx * sideways;
    if (flying) {
      const airSpeed = Math.hypot(car.vx, car.vz);
      if (airSpeed > topSpeed) { car.vx *= topSpeed / airSpeed; car.vz *= topSpeed / airSpeed; }
    }
    car.x += car.vx * dt; car.z += car.vz * dt; car.throttle = input.throttle;
    if (!this.resolveDriveContacts(car, before)) { this.tires.delete(car.id); return; }
    if (flying && car.mode === 'driving' && before.z >= GARAGE_RAMP.doorZ && car.z < GARAGE_RAMP.doorZ && car.vz < 0
      && garageCarHull(car).every(p => p.x >= GARAGE_RAMP.left && p.x <= GARAGE_RAMP.right)) {
      this.fireTracks(car, now, 3.2);
      car.timeJump = { id: this.nextJump++, startedAt: now, arriveAt: now + GARAGE_TIME_JUMP_DELAY_MS, arrived: false, x: car.x, z: car.z, yaw: car.yaw };
      this.release(car.id); return;
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
  /** Resolve a whole contact chain atomically; a wall never lets an upstream body clip through. */
  private resolveDriveContacts(car: GarageDriveCar, before: GarageDriveCar): boolean {
    const hit = this.blocker(car);
    if (!hit) return true;
    const bodies = this.cars.map(body => ({ ...body })), people = this.pedestrians.map(p => ({ ...p }));
    const shovedBefore = new Set(this.shoved);
    const impact = typeof hit === 'object' ? Math.hypot(car.vx - hit.vx, car.vz - hit.vz) : Math.hypot(car.vx, car.vz);
    const resolved = hit !== 'scene' && this.pushContacts(car, new Set())
      && this.cars.every((body, i) => body.id !== car.id && body.x === bodies[i].x && body.z === bodies[i].z || !this.blocker(body));
    if (!resolved) {
      this.cars.forEach((body, i) => Object.assign(body, bodies[i]));
      this.pedestrians = people;
      this.shoved = shovedBefore;
      Object.assign(car, { x: before.x, z: before.z, yaw: before.yaw, vx: 0, vz: 0, slip: 0 });
      if (hit !== 'pedestrian' && impact > 1.1) { car.vx = -before.vx * .12; car.vz = -before.vz * .12; }
    }
    if (hit !== 'pedestrian' && impact > 1.1) {
      const severity = impact * impact * GARAGE_DRIVE_PROFILES[car.id].mass;
      car.damage = clamp(car.damage + severity * .018, 0, 1); this.repairTime.delete(car.id);
      if (typeof hit === 'object') { hit.damage = clamp(hit.damage + severity * .014 / GARAGE_DRIVE_PROFILES[hit.id].mass, 0, 1); this.repairTime.delete(hit.id); }
    }
    // A returning car replans from its displaced pose after the shove settles.
    if (resolved) this.cars.forEach((body, i) => {
      if (body.id !== car.id && (body.x !== bodies[i].x || body.z !== bodies[i].z)) {
        this.routes.delete(body.id); this.returnStalls.delete(body.id); this.parkingSpeeds.delete(body.id);
      }
    });
    return resolved;
  }
  private pushContacts(car: GarageDriveCar, chain: Set<GarageCarId>): boolean {
    chain = new Set(chain).add(car.id);
    // Four bodies bound recursion and retries; no browser supplies these poses.
    for (let attempt = 0; attempt < this.cars.length + this.pedestrians.length + 1; attempt++) {
      const hit = this.blocker(car, 0, chain);
      if (!hit) return true;
      if (hit === 'scene') return false;
      if (hit === 'pedestrian') { if (!this.pushPedestrians(car)) return false; continue; }
      if (hit.celebration) return false;
      const separation = contact(garageCarHull(car), garageCarHull(hit));
      if (!separation || separation.depth > .4) return false;
      const { x, z, depth } = separation;
      hit.x += x * (depth + .001); hit.z += z * (depth + .001);
      // Near-inelastic bumper contact shares momentum according to vehicle mass.
      const closing = Math.max(0, (car.vx - hit.vx) * x + (car.vz - hit.vz) * z);
      const mass = GARAGE_DRIVE_PROFILES[car.id].mass, otherMass = GARAGE_DRIVE_PROFILES[hit.id].mass;
      const impulse = 1.08 * closing / (1 / mass + 1 / otherMass);
      car.vx -= x * impulse / mass; car.vz -= z * impulse / mass;
      hit.vx += x * impulse / otherMass; hit.vz += z * impulse / otherMass;
      this.shoved.add(hit.id);
      if (!this.pushContacts(hit, chain)) return false;
    }
    return false;
  }
  private pushPedestrians(car: GarageDriveCar): boolean {
    for (const p of this.pedestrians) {
      if (p.sessionId && p.sessionId === car.driverSessionId) continue;
      if (!garageCarBlocksSegment(car, p, p.pushable ? p : { x: p.toX ?? p.x, z: p.toZ ?? p.z }, p.radius ?? .32)) continue;
      if (!p.pushable || !p.sessionId) return false;
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw), profile = GARAGE_DRIVE_PROFILES[car.id];
      const localX = (p.x - car.x) * c - (p.z - car.z) * s, localZ = (p.x - car.x) * s + (p.z - car.z) * c;
      const width = profile.width / 2 + (p.radius ?? .32) + .015, length = profile.length / 2 + (p.radius ?? .32) + .015;
      const dx = Math.sign(localX || 1) * (width - Math.abs(localX)), dz = Math.sign(localZ || 1) * (length - Math.abs(localZ));
      const offsets = Math.abs(dx) < Math.abs(dz) ? [{ x: dx * c, z: -dx * s }, { x: dz * s, z: dz * c }] : [{ x: dz * s, z: dz * c }, { x: dx * c, z: -dx * s }];
      const offset = offsets.find(offset => {
        const target = { x: p.x + offset.x, z: p.z + offset.z };
        if (Math.hypot(offset.x, offset.z) > .4 || !clearFactorySegment({ x: p.x, z: p.z + GARAGE_WORLD_Z }, { x: target.x, z: target.z + GARAGE_WORLD_Z })) return false;
        const radius = p.radius ?? .32;
        if (target.x - radius < -11.8 || target.x + radius > 11.8 || target.z - radius < -4.3 || target.z + radius > 16) return false;
        if ([-radius, 0, radius].some(dx => [-radius, 0, radius].some(dz =>
          !clearFactorySegment({ x: p.x + dx, z: p.z + GARAGE_WORLD_Z + dz }, { x: target.x + dx, z: target.z + GARAGE_WORLD_Z + dz })))) return false;
        if (this.cars.some(other => other.id !== car.id && garageCarBlocksSegment(other, p, target, p.radius ?? .32))) return false;
        return !this.pedestrians.some(other => other !== p && Math.hypot(other.x - target.x, other.z - target.z) < (other.radius ?? .32) + (p.radius ?? .32));
      });
      if (!offset) return false;
      p.x += offset.x; p.z += offset.z; p.toX = p.x; p.toZ = p.z;
      // People have a little weight, but never absorb a car's entire momentum.
      const speed = Math.hypot(car.vx, car.vz), retained = GARAGE_DRIVE_PROFILES[car.id].mass / (GARAGE_DRIVE_PROFILES[car.id].mass + .025);
      if (speed > 0) { car.vx *= retained; car.vz *= retained; }
    }
    return true;
  }
  private coastStep(car: GarageDriveCar, dt: number) {
    const before = { ...car }, speed = Math.hypot(car.vx, car.vz);
    const next = Math.max(0, speed * Math.exp(-2.6 * dt) - .6 * dt);
    car.vx *= speed ? next / speed : 0; car.vz *= speed ? next / speed : 0;
    car.x += car.vx * dt; car.z += car.vz * dt;
    this.resolveDriveContacts(car, before);
    if (Math.hypot(car.vx, car.vz) < .03) { car.vx = car.vz = 0; this.shoved.delete(car.id); }
    this.repairTime.delete(car.id);
  }
  private fireTracks(car: GarageDriveCar, now: number, length: number) {
    const p = GARAGE_DRIVE_PROFILES[car.id], fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    for (const side of [-1, 1]) for (let segment = 0; segment < 10; segment++) {
      const point = (distance: number) => ({ x: car.x - fx * distance + Math.cos(car.yaw) * p.width * .38 * side,
        z: car.z - fz * distance - Math.sin(car.yaw) * p.width * .38 * side });
      const a = point(segment * length / 10 + .35), b = point((segment + 1) * length / 10 + .35);
      this.marks.push({ id: this.nextMark++, car: car.id, x1: a.x, z1: a.z, x2: b.x, z2: b.z, y1: garageRampHeightAt(a.x, a.z), y2: garageRampHeightAt(b.x, b.z),
        kind: 'fire', width: .13, opacity: .75, createdAt: now });
    }
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
