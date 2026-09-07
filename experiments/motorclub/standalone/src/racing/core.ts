import { CatmullRomCurve3, Vector3 } from "three";

export type CarId = "porsche" | "mini" | "delorean" | "f1";
export type Mode =
  "garage" | "boarding" | "departing" | "loading" | "countdown" | "racing" | "paused" | "results";
export interface DrivingInput {
  steer: number;
  throttle: number;
  brake: number;
  reverse?: boolean;
  drift?: boolean;
}
export interface CarTuning {
  name: string;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  grip: number;
  steering: number;
  driftGrip: number;
  color: string;
}
export const TUNING: Record<CarId, CarTuning> = {
  porsche: {
    name: "porsche",
    maxSpeed: 36,
    acceleration: 22,
    braking: 20,
    grip: 10,
    steering: 1.8,
    driftGrip: 2.0,
    color: "#d9c99e",
  },
  mini: {
    name: "mini cooper",
    maxSpeed: 31,
    acceleration: 23,
    braking: 21,
    grip: 12,
    steering: 2.05,
    driftGrip: 3.0,
    color: "#32684f",
  },
  delorean: {
    name: "delorean",
    maxSpeed: 34,
    acceleration: 19,
    braking: 15,
    grip: 8,
    steering: 1.65,
    driftGrip: 1.5,
    color: "#a8b1b7",
  },
  f1: {
    name: "f1",
    maxSpeed: 41,
    acceleration: 25,
    braking: 24,
    grip: 10,
    steering: 2.15,
    driftGrip: 2.3,
    color: "#ca6549",
  },
};
export const TRACK_VERSION = "mountain-loop-1";
export const HANDLING_VERSION = "arcade-3";
export const STEP = 1 / 120;
export const WORLD_SCALE = 22;
export const ROAD_HALF = 4.6;
export const SAMPLE_COUNT = 960;
export const GATE_COUNT = 16;
export interface TrackSample {
  p: Vector3;
  tangent: Vector3;
  right: Vector3;
  distance: number;
}
export interface Track {
  samples: TrackSample[];
  length: number;
  gates: TrackSample[];
  heightAt: (x: number, z: number) => number;
}
const knots = [
  [0, 4],
  [-2.5, 4],
  [-5.5, 2.5],
  [-7, -0.5],
  [-6, -3.5],
  [-3, -5],
  [-2.8, -7.5],
  [-6.5, -8.7],
  [-7.5, -11.5],
  [-5.5, -13.5],
  [-2, -12.6],
  [0.5, -10],
  [3, -10.6],
  [5.5, -12.3],
  [7.6, -10],
  [5.2, -7],
  [6.8, -3.6],
  [5.8, -0.6],
  [3.8, 2.4],
  [1.8, 4],
];
export function createTrack(heightAt: (x: number, z: number) => number): Track {
  const curve = new CatmullRomCurve3(
    knots.map(([x, z]) => new Vector3(x * WORLD_SCALE, 0, z * WORLD_SCALE)),
    true,
    "centripetal",
  );
  const pts = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, SAMPLE_COUNT);
  const base = pts.map((p, i) => {
    const t = pts[(i + 1) % SAMPLE_COUNT]
      .clone()
      .sub(pts[(i + SAMPLE_COUNT - 1) % SAMPLE_COUNT])
      .normalize();
    const right = new Vector3(t.z, 0, -t.x);
    return (
      Math.max(
        ...[-6, 0, 6].map((o) =>
          heightAt(p.x + right.x * o, p.z + right.z * o),
        ),
      ) + 0.3
    );
  });
  // Smooth the high envelope: road shoulders never cut through the source mountain.
  const envelope = base.map((_, i) =>
    Math.max(
      ...Array.from(
        { length: 25 },
        (_, j) => base[(i + j - 12 + SAMPLE_COUNT) % SAMPLE_COUNT],
      ),
    ),
  );
  const ys = envelope.map(
    (_, i) =>
      Array.from(
        { length: 13 },
        (_, j) => envelope[(i + j - 6 + SAMPLE_COUNT) % SAMPLE_COUNT],
      ).reduce((a, b) => a + b, 0) /
        13 +
      0.4,
  );
  // Cap road grades at 22 degrees while keeping the road above the source terrain.
  for (let pass = 0; pass < 4; pass++)
    for (const direction of [1, -1])
      for (let j = 0; j < SAMPLE_COUNT; j++) {
        const i = direction === 1 ? j : SAMPLE_COUNT - 1 - j,
          n = (i + direction + SAMPLE_COUNT) % SAMPLE_COUNT;
        ys[n] = Math.max(ys[n], ys[i] - pts[i].distanceTo(pts[n]) * 0.4);
      }
  pts.forEach((p, i) => (p.y = ys[i]));
  let length = 0;
  const samples = pts.map((p, i) => {
    if (i) length += p.distanceTo(pts[i - 1]);
    const tangent = pts[(i + 1) % SAMPLE_COUNT]
      .clone()
      .sub(pts[(i + SAMPLE_COUNT - 1) % SAMPLE_COUNT])
      .normalize();
    return {
      p,
      tangent,
      right: new Vector3(tangent.z, 0, -tangent.x).normalize(),
      distance: length,
    };
  });
  length += pts[0].distanceTo(pts[SAMPLE_COUNT - 1]);
  return {
    samples,
    length,
    gates: Array.from(
      { length: GATE_COUNT },
      (_, i) => samples[Math.floor((i * SAMPLE_COUNT) / GATE_COUNT)],
    ),
    heightAt,
  };
}
export interface RoadContact {
  p: Vector3;
  tangent: Vector3;
  right: Vector3;
  lateral: number;
  index: number;
  progress: number;
  distance: number;
}
export function roadContact(track: Track, p: Vector3): RoadContact {
  let best = Infinity,
    index = 0,
    frac = 0;
  const a = new Vector3(),
    b = new Vector3();
  for (let i = 0; i < track.samples.length; i++) {
    a.copy(track.samples[i].p);
    b.copy(track.samples[(i + 1) % track.samples.length].p).sub(a);
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * b.x + (p.z - a.z) * b.z) / (b.x * b.x + b.z * b.z),
      ),
    );
    const d = (p.x - a.x - b.x * t) ** 2 + (p.z - a.z - b.z * t) ** 2;
    if (d < best) {
      best = d;
      index = i;
      frac = t;
    }
  }
  const s = track.samples[index],
    n = track.samples[(index + 1) % track.samples.length];
  const point = s.p.clone().lerp(n.p, frac),
    tangent = s.tangent.clone().lerp(n.tangent, frac).normalize();
  const right = new Vector3(tangent.z, 0, -tangent.x).normalize();
  return {
    p: point,
    tangent,
    right,
    lateral: p.clone().sub(point).dot(right),
    index,
    progress: (index + frac) / track.samples.length,
    distance: Math.sqrt(best),
  };
}
export interface VehicleState {
  position: Vector3;
  velocity: Vector3;
  heading: number;
  speed: number;
  steer: number;
  slip: number;
  contact: RoadContact;
  impact: number;
  driftDirection: number;
  driftCharge: number;
  boost: number;
}
export interface VehicleController {
  state: VehicleState;
  step(input: DrivingInput, dt: number): void;
  reset(sample: TrackSample): void;
  dispose(): void;
}
export class ArcadeController implements VehicleController {
  state: VehicleState;
  constructor(
    public track: Track,
    public tuning: CarTuning,
  ) {
    this.state = {
      position: new Vector3(),
      velocity: new Vector3(),
      heading: 0,
      speed: 0,
      steer: 0,
      slip: 0,
      contact: roadContact(track, track.samples[0].p),
      impact: 0,
      driftDirection: 0, driftCharge: 0, boost: 0,
    };
    this.reset(track.samples[0]);
  }
  reset(sample: TrackSample) {
    const s = this.state;
    s.position.copy(sample.p);
    s.velocity.set(0, 0, 0);
    s.heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    s.driftDirection = 0; s.driftCharge = 0; s.boost = 0;
    s.speed = 0;
    s.steer = 0;
    s.slip = 0;
    s.contact = roadContact(this.track, s.position);
  }
  cancelDrift() { this.state.driftDirection=0; this.state.driftCharge=0; this.state.boost=0; }
  step(input: DrivingInput, dt: number) {
    const s = this.state,
      t = this.tuning;
    s.steer += (input.steer - s.steer) * (1 - Math.exp(-13 * dt));
    s.impact = Math.max(0, s.impact - dt * 3);
    let forward = new Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    const signed = s.velocity.dot(forward);
    s.boost=Math.max(0,s.boost-dt);
    const clean = Math.abs(s.contact.lateral)<ROAD_HALF-.2 && s.impact<.05 && signed>8 && input.brake===0;
    if(s.driftDirection && (!clean || !input.drift)) {
      if(clean && !input.drift && s.driftCharge>=.75) {
        s.boost=s.driftCharge>=1.5?1.15:.65;
        s.velocity.addScaledVector(forward,4);
      }
      s.driftDirection=0; s.driftCharge=0;
    }
    if(input.drift && clean && !s.driftDirection && Math.abs(input.steer)>.25) s.driftDirection=Math.sign(input.steer);
    if(s.driftDirection && input.steer*s.driftDirection>.15) s.driftCharge=Math.min(1.5,s.driftCharge+dt);
    // The held turn has a stable direction; countersteer opens the arc without snapping it over.
    const turn=s.driftDirection ? s.driftDirection*(.55+.45*s.steer*s.driftDirection) : s.steer;
    s.heading +=
      ((turn * t.steering * Math.min(1, Math.abs(signed) / 5)) /
        (1 + Math.abs(signed) / 36)) *
      Math.sign(signed || 1) *
      dt;
    forward.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const right = new Vector3(forward.z, 0, -forward.x);
    let longitudinal = s.velocity.dot(forward),
      lateral = s.velocity.dot(right);
    const drifting =
      s.driftDirection !== 0;
    lateral *= Math.exp(-(drifting ? t.driftGrip : t.grip) * dt);
    if(s.boost>0) longitudinal+=t.acceleration*.9*dt;
    if (input.throttle > 0)
      longitudinal +=
        input.throttle *
        t.acceleration *
        Math.max(0, 1 - Math.pow(Math.max(0, longitudinal) / t.maxSpeed, 2)) *
        dt;
    if (input.brake > 0) {
      if (longitudinal > 0.15)
        longitudinal = Math.max(0, longitudinal - input.brake * t.braking * (drifting && input.throttle > 0 ? 0.3 : 1) * dt);
      else if (input.reverse && input.throttle === 0)
        longitudinal = Math.max(-5, longitudinal - input.brake * 4 * dt);
    }
    const slope = s.contact.tangent.y * forward.dot(s.contact.tangent);
    longitudinal -= slope * 9.81 * dt;
    if (input.brake > 0 && !input.reverse && Math.abs(signed) < 0.5)
      longitudinal = 0;
    if (Math.abs(signed) < 0.3 && input.throttle === 0 && input.brake === 0)
      longitudinal = 0;
    longitudinal *= Math.exp(
      -(Math.abs(s.contact.lateral) > ROAD_HALF ? 0.9 : 0.025) * dt,
    );
    longitudinal = Math.max(-5, Math.min(t.maxSpeed * (s.boost>0?1.22:1.15), longitudinal));
    s.velocity
      .copy(forward)
      .multiplyScalar(longitudinal)
      .addScaledVector(right, lateral);
    s.position.addScaledVector(s.velocity, dt);
    let contact = roadContact(this.track, s.position);
    // A swept footprint checks both ends, rather than treating a long car as a point.
    for (const offset of [-1.7, 1.7]) {
      const probe = s.position.clone().addScaledVector(forward, offset),
        c = roadContact(this.track, probe);
      const driveway=c.lateral>0 && (c.progress<8/this.track.length || c.progress>1-22/this.track.length);
      if (
        !driveway && Math.abs(c.lateral) > ROAD_HALF + 0.45 &&
        Math.abs(c.lateral) < ROAD_HALF + 4
      ) {
        const side = Math.sign(c.lateral),
          outward = s.velocity.dot(c.right) * side;
        s.position.addScaledVector(
          c.right,
          -side * (Math.abs(c.lateral) - (ROAD_HALF + 0.45)),
        );
        if (outward > 0) {
          s.velocity.addScaledVector(c.right, -side * outward * 1.1);
          s.velocity.multiplyScalar(0.96);
          s.impact = Math.min(1, outward / 8);
        }
      }
    }
    contact = roadContact(this.track, s.position);
    if(s.impact>.05 || Math.abs(contact.lateral)>ROAD_HALF) this.cancelDrift();
    s.position.y = contact.p.y;
    s.contact = contact;
    s.speed = s.velocity.length();
    s.slip = Math.abs(
      Math.atan2(
        s.velocity.dot(right),
        Math.abs(s.velocity.dot(forward)) + 0.1,
      ),
    );
  }
  dispose() {}
}
export class RunTimer {
  elapsed = 0;
  penalty = 0;
  nextGate = 1;
  finished = false;
  lastGate = 0;
  constructor(public track: Track) {}
  step(previous: Vector3, current: Vector3, dt: number) {
    if (this.finished) return;
    this.elapsed += dt;
    const gate = this.track.gates[this.nextGate % GATE_COUNT];
    const before = previous.clone().sub(gate.p).dot(gate.tangent),
      after = current.clone().sub(gate.p).dot(gate.tangent);
    if (before < 0 && after >= 0) {
      const crossing = previous
        .clone()
        .lerp(current, -before / (after - before));
      if (
        Math.abs(crossing.clone().sub(gate.p).dot(gate.right)) <=
        ROAD_HALF + 1.0
      ) {
        this.lastGate = this.nextGate % GATE_COUNT;
        this.nextGate++;
        if (this.nextGate > GATE_COUNT) {
          this.finished = true;
          this.elapsed -= dt * (1 - -before / (after - before));
        }
      }
    }
  }
  reset() {
    this.penalty += 2;
    return this.track.gates[this.lastGate];
  }
  get total() {
    return this.elapsed + this.penalty;
  }
}
export interface RecordRun {
  car: CarId;
  ms: number;
  date: string;
}
export const RECORD_KEY = `fluid.motorclub.${TRACK_VERSION}.${HANDLING_VERSION}`;
export function validRecords(raw: string | null): RecordRun[] {
  try {
    const data: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (r): r is RecordRun =>
          !!r &&
          typeof r === "object" &&
          Object.hasOwn(TUNING, r.car) &&
          Number.isSafeInteger(r.ms) &&
          r.ms > 0 &&
          r.ms < 86400000 &&
          typeof r.date === "string",
      )
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 100);
  } catch {
    return [];
  }
}
export function ranked(records: RecordRun[]) {
  return [...records].sort((a, b) => a.ms - b.ms).slice(0, 5);
}
export function bestFor(records: RecordRun[], car: CarId) {
  return records
    .filter((r) => r.car === car)
    .reduce<number | undefined>(
      (a, r) => (a === undefined ? r.ms : Math.min(a, r.ms)),
      undefined,
    );
}
export function addRecord(records: RecordRun[], run: RecordRun) {
  const all = [...records, run].sort((a, b) => a.ms - b.ms);
  // Keep each car's best even when one faster car dominates the overall board.
  return all.filter(
    (r, i) => i < 50 || all.findIndex((x) => x.car === r.car) === i,
  );
}
export function formatTime(ms: number) {
  const n = Math.max(0, Math.round(ms));
  return `${Math.floor(n / 60000)}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")}.${String(n % 1000).padStart(3, "0")}`;
}
