export type GarageParkingPose = { x: number; z: number; yaw: number };
type Pose = GarageParkingPose;
type Gear = 1 | -1;
type Segment = { length: number; curvature: number; gear: Gear };
type Connection = { segments: Segment[]; goal: Pose; suffix: Pose[]; cost: number };
type Node = { pose: Pose; gear: Gear; cost: number; rank: number; parent?: Node; edge: Pose[]; key: string };
const TAU = Math.PI * 2;
const SAMPLE_DISTANCE = .14;
const GROUND_RADIUS = 2.3;
const MAX_CHECKS = 24_000;
const MAX_EXPANSIONS = 1_600;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const positive = (angle: number) => {
  const value = (angle % TAU + TAU) % TAU;
  return value < 1e-10 || TAU - value < 1e-10 ? 0 : value;
};
const distance = (a: Pose, b: Pose) => Math.hypot(a.x - b.x, a.z - b.z);
const bounded = (p: Pose) => [p.x, p.z, p.yaw].every(Number.isFinite) && p.x >= -11.8 && p.x <= 11.8 && p.z >= -4.3 && p.z <= 16;

/** Advance a bicycle arc exactly. Positive yaw turns +Z toward +X. */
function advance(from: Pose, length: number, curvature: number): Pose {
  if (Math.abs(curvature) < 1e-9) return { x: from.x + Math.sin(from.yaw) * length, z: from.z + Math.cos(from.yaw) * length, yaw: from.yaw };
  const yaw = from.yaw + curvature * length;
  return { x: from.x + (Math.cos(from.yaw) - Math.cos(yaw)) / curvature, z: from.z + (Math.sin(yaw) - Math.sin(from.yaw)) / curvature, yaw: wrap(yaw) };
}

/** Tangent connections between left/right turning circles; no history is involved. */
function connections(start: Pose, goal: Pose, radius: number): Array<{ segments: Segment[]; cost: number }> {
  const result: Array<{ segments: Segment[]; cost: number }> = [];
  for (const gear of [1, -1] as const) for (const first of [-1, 1]) for (const last of [-1, 1]) {
    const a = { x: start.x + first * radius * Math.cos(start.yaw), z: start.z - first * radius * Math.sin(start.yaw) };
    const b = { x: goal.x + last * radius * Math.cos(goal.yaw), z: goal.z - last * radius * Math.sin(goal.yaw) };
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < 1e-8) {
      if (first !== last) continue;
      const length = radius * positive((goal.yaw - start.yaw) * first * gear);
      result.push({ segments: [{ length, curvature: first / radius, gear }], cost: length * (gear < 0 ? 1.15 : 1) }); continue;
    }
    const sine = (last - first) * radius / d;
    if (Math.abs(sine) > 1 + 1e-9) continue;
    const tangent = Math.asin(Math.max(-1, Math.min(1, sine))), bearing = Math.atan2(dx, dz);
    for (const yaw of [bearing - tangent, bearing - Math.PI + tangent]) {
      const straight = gear * (dx * Math.sin(yaw) + dz * Math.cos(yaw));
      if (straight < -1e-8) continue;
      const segments: Segment[] = [
        { length: radius * positive((yaw - start.yaw) * first * gear), curvature: first / radius, gear },
        { length: Math.max(0, straight), curvature: 0, gear },
        { length: radius * positive((goal.yaw - yaw) * last * gear), curvature: last / radius, gear },
      ];
      result.push({ segments, cost: segments.reduce((sum, segment) => sum + segment.length, 0) * (gear < 0 ? 1.15 : 1) });
    }
  }
  return result;
}

class Queue {
  private nodes: Node[] = [];
  get length() { return this.nodes.length; }
  push(node: Node) {
    let index = this.nodes.length; this.nodes.push(node);
    while (index > 0) { const parent = (index - 1) >> 1; if (this.nodes[parent].rank <= node.rank) break; this.nodes[index] = this.nodes[parent]; index = parent; }
    this.nodes[index] = node;
  }
  pop(): Node {
    const first = this.nodes[0], last = this.nodes.pop()!;
    if (!this.nodes.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.nodes.length && this.nodes[child + 1].rank < this.nodes[child].rank) child++;
      if (this.nodes[child].rank >= last.rank) break;
      this.nodes[index] = this.nodes[child]; index = child;
    }
    this.nodes[index] = last; return first;
  }
}

/**
 * Fresh, bounded parking plan including exact start and goal. `clear` must test
 * the whole car footprint against current geometry/cars, excluding this car.
 * Ground paths use tangent arcs and forward/reverse motion, never lateral
 * sliding or in-place rotation. The caller must recheck/replan as traffic moves.
 * Undefined means blocked or the bounded search budget was exhausted.
 */
export function planGarageParking(start: Pose, goal: Pose, clear: (pose: Pose) => boolean, options: { flying?: boolean } = {}): Pose[] | undefined {
  let checks = 0;
  const safe = (pose: Pose) => bounded(pose) && checks++ < MAX_CHECKS && clear(pose);
  if (!safe(start) || !safe(goal)) return;
  if (distance(start, goal) < 1e-7 && Math.abs(wrap(start.yaw - goal.yaw)) < 1e-7) return [{ ...goal }];
  const radius = options.flying ? 1.1 : GROUND_RADIUS;
  const safeEdge = (a: Pose, b: Pose) => safe({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: wrap(a.yaw + wrap(b.yaw - a.yaw) / 2) }) && safe(b);
  function trace(from: Pose, segments: Segment[]): Pose[] | undefined {
    const path: Pose[] = []; let at = from;
    for (const segment of segments) {
      const count = Math.ceil(segment.length / SAMPLE_DISTANCE);
      for (let i = 1; i <= count; i++) {
        const pose = advance(at, segment.gear * segment.length * i / count, segment.curvature);
        // The follower interpolates the chord between poses, not the exact
        // circular arc. Check that interpolation as well as the arc endpoint.
        if (!safeEdge(path.at(-1) ?? from, pose)) return;
        path.push(pose);
      }
      at = path.at(-1) ?? at;
    }
    return path;
  }
  function flightLine(from: Pose, to: Pose): Pose[] | undefined {
    const count = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_DISTANCE), Math.ceil(Math.abs(wrap(to.yaw - from.yaw)) / .08));
    const path: Pose[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / count, pose = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, yaw: wrap(from.yaw + wrap(to.yaw - from.yaw) * t) };
      if (!safeEdge(path.at(-1) ?? from, pose)) return;
      path.push(pose);
    }
    path[path.length - 1] = { ...to }; return path;
  }
  if (options.flying) { const direct = flightLine(start, goal); if (direct) return [{ ...start }, ...direct]; }
  // Finish straight in the narrow bay rather than forcing a turn between the
  // parked neighbors. The reverse approach is used only when that side is clear.
  const arrivals = [{ pose: goal, suffix: [] as Pose[] }];
  for (const gear of [1, -1] as const) {
    const pose = advance(goal, -gear * 3.2, 0);
    if (!safe(pose)) continue;
    const suffix = trace(pose, [{ length: 3.2, curvature: 0, gear }]);
    if (suffix) { suffix[suffix.length - 1] = { ...goal }; arrivals.push({ pose, suffix }); }
  }
  function connect(from: Pose): Pose[] | undefined {
    if (options.flying) { const direct = flightLine(from, goal); if (direct) return direct; }
    const candidates: Connection[] = arrivals.flatMap(({ pose, suffix }) => connections(from, pose, radius).map(candidate => ({ ...candidate, goal: pose, suffix, cost: candidate.cost + (suffix.length ? 3.2 : 0) })));
    candidates.sort((a, b) => a.cost - b.cost);
    for (const candidate of candidates) {
      // Avoid gratuitous full circles; local search supplies shorter maneuvers.
      if (candidate.cost > distance(from, goal) * 1.7 + 6) continue;
      const path = trace(from, candidate.segments); if (!path) continue;
      const end = path.at(-1) ?? from;
      if (distance(end, candidate.goal) > 1e-5 || Math.abs(wrap(end.yaw - candidate.goal.yaw)) > 1e-5) continue;
      if (path.length) path[path.length - 1] = { ...candidate.goal };
      return [...path, ...candidate.suffix];
    }
  }
  const direct = connect(start); if (direct) return [{ ...start }, ...direct];
  const key = (pose: Pose, gear: Gear) => `${Math.round(pose.x / .4)},${Math.round(pose.z / .4)},${Math.round(positive(pose.yaw) / (TAU / 24)) % 24},${gear}`;
  const heuristic = (pose: Pose) => distance(pose, goal) * 1.25 + Math.abs(wrap(pose.yaw - goal.yaw)) * .4;
  const queue = new Queue(), costs = new Map<string, number>();
  const first: Node = { pose: { ...start }, gear: 1, cost: 0, rank: heuristic(start), edge: [], key: key(start, 1) };
  queue.push(first); costs.set(first.key, 0);
  for (let expanded = 0; queue.length && expanded < MAX_EXPANSIONS && checks < MAX_CHECKS; expanded++) {
    const node = queue.pop(); if (node.cost > costs.get(node.key)!) continue;
    if (expanded > 0 && (expanded % 12 === 0 || distance(node.pose, goal) < 3 && expanded % 3 === 0)) {
      const end = connect(node.pose);
      if (end) {
        const edges: Pose[][] = []; let cursor: Node | undefined = node;
        while (cursor?.parent) { edges.push(cursor.edge); cursor = cursor.parent; }
        return [{ ...start }, ...edges.reverse().flat(), ...end];
      }
    }
    for (const gear of [1, -1] as const) for (const curve of [-1, 0, 1]) {
      const length = .72, curvature = curve / radius;
      const pose = advance(node.pose, gear * length, curvature), id = key(pose, gear);
      const cost = node.cost + length * (gear < 0 ? 1.15 : 1) + (gear === node.gear ? 0 : .55) + Math.abs(curve) * .04;
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      const edge = trace(node.pose, [{ length, curvature, gear }]); if (!edge) continue;
      costs.set(id, cost); queue.push({ pose, gear, cost, rank: cost + heuristic(pose), parent: node, edge, key: id });
    }
    if (options.flying) for (const turn of [-1, 1]) {
      const pose = { ...node.pose, yaw: wrap(node.pose.yaw + turn * Math.PI / 6) }, id = key(pose, node.gear), cost = node.cost + .6;
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      const edge = flightLine(node.pose, pose); if (!edge) continue;
      costs.set(id, cost); queue.push({ pose, gear: node.gear, cost, rank: cost + heuristic(pose), parent: node, edge, key: id });
    }
  }
}
