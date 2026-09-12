import { FACTORY_OBSTACLES, INTERIOR_Z, type FactoryRoom } from './factory25d-layout.js';
import { patioFloorHeight } from './factory25d-patio.js';

export interface BallVector { x: number; y: number; z: number }
export const VISITOR_BALL_RADIUS = .073;
export const VISITOR_BALL_RIM: BallVector = { x: 1.3, y: 1.68, z: -6.18 + .22 * .84 };
export type VisitorBallInput = { type: 'visitor_ball'; phase: 'hold' | 'throw'; position: BallVector; velocity?: BallVector; room?: FactoryRoom }
  | { type: 'visitor_ball'; phase: 'cancel' };
export type VisitorBallUpdate = { type: 'visitor_ball_update'; visitorId: string; serverTime: number } &
  ({ phase: 'hold' | 'throw'; position: BallVector; velocity?: BallVector; room?: FactoryRoom } | { phase: 'cancel' });

export function validBallRoom(room: unknown): room is FactoryRoom { return room === 'factory' || room === 'patio' || room === 'garage'; }
export function validBallVector(value: unknown, velocity = false, room: FactoryRoom = 'factory'): value is BallVector {
  if (!value || typeof value !== 'object') return false;
  const p = value as BallVector;
  if (![p.x, p.y, p.z].every(v => typeof v === 'number' && Number.isFinite(v))) return false;
  return velocity ? Math.abs(p.x) <= 10 && Math.abs(p.y) <= 10 && Math.abs(p.z) <= 10
    : p.x >= (room === 'patio' ? 8 : room === 'garage' ? -11.8 : -7.8)
      && p.x <= (room === 'patio' ? 24 : room === 'garage' ? 11.8 : 7.8)
      && p.y >= (room === 'patio' ? -1.12 : 0) + VISITOR_BALL_RADIUS - .001 && p.y <= 8
      && p.z >= (room === 'factory' ? -6.12 : -4.3) && p.z <= (room === 'garage' ? 16 : room === 'factory' ? 11.75 : 13.7);
}

/** Pull opposite the desired shot. No hoop snapping or target correction. */
export function visitorPullVelocity(pull: Pick<BallVector, 'x' | 'z'>): BallVector {
  const length = Math.hypot(pull.x, pull.z);
  if (!Number.isFinite(length) || length < .025) return { x: 0, y: 0, z: 0 };
  const power = Math.min(10, length * 4);
  return { x: pull.x / length * power, y: Math.min(7, 5 + length * .8), z: pull.z / length * power };
}
export function visitorBallFloor(p: BallVector, room: FactoryRoom = 'factory') {
  return room === 'patio' ? patioFloorHeight(p) : 0;
}

/** A gentle arc toward the release target, shared by keyboard and pointer shots. */
export function visitorShotVelocity(start: BallVector, aim: BallVector = VISITOR_BALL_RIM): BallVector {
  const flight = Math.max(Math.sqrt(2 * Math.max(0, aim.y - start.y) / 9.8) + .18,
    Math.min(.9, .52 + Math.hypot(aim.x - start.x, aim.z - start.z) * .12),
    // Long shots need time to travel without clipping the horizontal velocity.
    Math.abs(aim.x - start.x) / 10, Math.abs(aim.z - start.z) / 10);
  const limit = (n: number) => Math.max(-10, Math.min(10, n));
  return { x: limit((aim.x - start.x) / flight), y: limit((aim.y - start.y) / flight + 4.9 * flight), z: limit((aim.z - start.z) / flight) };
}
export interface FlyingBall { position: BallVector; velocity: BallVector; scored: boolean; room?: FactoryRoom }
/** Fixed substeps keep floor, glass and rim contacts consistent on slow frames. */
export function stepVisitorBall(ball: FlyingBall, seconds: number): { swish: boolean; bounce: number; rimImpact: number; floorHit: boolean } {
  let remaining = Math.max(0, Math.min(.1, seconds)), swish = false, bounce = 0, rimImpact = 0, floorHit = false;
  const p = ball.position, v = ball.velocity, rim = VISITOR_BALL_RIM;
  const room = ball.room ?? 'factory';
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120); remaining -= dt;
    const before = { ...p };
    p.x += v.x * dt; p.y += v.y * dt - 4.9 * dt * dt; p.z += v.z * dt; v.y -= 9.8 * dt;
    if (room === 'factory' && !ball.scored && before.y > rim.y && p.y <= rim.y) {
      const t = (before.y - rim.y) / (before.y - p.y);
      const distance = Math.hypot(before.x + (p.x - before.x) * t - rim.x, before.z + (p.z - before.z) * t - rim.z);
      if (distance < .15 * .84 - .035) { ball.scored = true; swish = true; }
      else if (distance < .15 * .84 + VISITOR_BALL_RADIUS && distance > .075) { rimImpact = Math.max(rimImpact, Math.min(1, Math.abs(v.y) / 6)); p.y = rim.y + .01; v.y = Math.abs(v.y) * .48; bounce = Math.max(bounce, .4); }
    }
    const back = room === 'factory' ? -6.12 : -4.3;
    if (p.z < back) { p.z = back; v.z = Math.abs(v.z) * .62; bounce = Math.max(bounce, .3); }
    let floor = visitorBallFloor(p, room);
    // Low furniture can be cleared by a lob; room dividers stay solid.
    const worldZ = p.z + (room === 'factory' ? INTERIOR_Z : room === 'garage' ? 24 : 0);
    for (const obstacle of FACTORY_OBSTACLES) {
      if (p.x + VISITOR_BALL_RADIUS <= obstacle.left || p.x - VISITOR_BALL_RADIUS >= obstacle.right
        || worldZ + VISITOR_BALL_RADIUS <= obstacle.near || worldZ - VISITOR_BALL_RADIUS >= obstacle.far) continue;
      const wall = obstacle.right - obstacle.left < .55 || obstacle.far - obstacle.near < .5;
      const top = (wall ? 2.3 : .8) + (room === 'patio' ? floor : 0);
      if (p.y - VISITOR_BALL_RADIUS >= top) continue;
      if (before.y - VISITOR_BALL_RADIUS >= top - .01 && v.y < 0) { floor = Math.max(floor, top); continue; }
      const contacts = [
        { d: p.x - obstacle.left + VISITOR_BALL_RADIUS, axis: 'x' as const, value: obstacle.left - VISITOR_BALL_RADIUS, sign: -1 },
        { d: obstacle.right - p.x + VISITOR_BALL_RADIUS, axis: 'x' as const, value: obstacle.right + VISITOR_BALL_RADIUS, sign: 1 },
        { d: worldZ - obstacle.near + VISITOR_BALL_RADIUS, axis: 'z' as const, value: p.z + obstacle.near - worldZ - VISITOR_BALL_RADIUS, sign: -1 },
        { d: obstacle.far - worldZ + VISITOR_BALL_RADIUS, axis: 'z' as const, value: p.z + obstacle.far - worldZ + VISITOR_BALL_RADIUS, sign: 1 },
      ].sort((a,b) => a.d - b.d);
      const hit = contacts[0]; p[hit.axis] = hit.value;
      if (v[hit.axis] * hit.sign < 0) { bounce = Math.max(bounce, Math.min(1, Math.abs(v[hit.axis]) / 6)); v[hit.axis] *= -.55; }
    }
    if (p.y < floor + VISITOR_BALL_RADIUS) {
      floorHit = true;
      p.y = floor + VISITOR_BALL_RADIUS; bounce = Math.max(bounce, Math.min(1, Math.abs(v.y) / 5));
      v.y = Math.abs(v.y) > .5 ? Math.abs(v.y) * .6 : 0;
      const friction = Math.exp(-2.2 * dt); v.x *= friction; v.z *= friction;
    }
    const left = room === 'patio' ? 8.05 : room === 'garage' ? -11.75 : -7.75;
    const right = room === 'patio' ? 23.95 : room === 'garage' ? 11.75 : 7.75;
    if (p.x < left) { p.x = left; v.x = Math.abs(v.x) * .5; }
    if (p.x > right) { p.x = right; v.x = -Math.abs(v.x) * .5; }
    const front = room === 'garage' ? 15.95 : room === 'factory' ? 11.7 : 13.65;
    if (p.z > front) { p.z = front; v.z = -Math.abs(v.z) * .5; }
  }
  return { swish, bounce, rimImpact, floorHit };
}
