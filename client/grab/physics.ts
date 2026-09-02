import { CONTROL_WORLD_BOUNDS } from '@shared/constants';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface SpringState extends Point {
  vx: number;
  vy: number;
}

// Tuning (world pixels at scale 1; subagents pass scale 0.5)
export const GRAB_REST_LENGTH = 26; // relaxed elastic length from pointer to anchor; clears the head so the band stays visible
export const GRAB_LIFT_HEIGHT = 20; // how far the feet hang above the floor shadow
export const GRAB_GRAVITY = 1300; // px/s^2 for the drop
export const GRAB_SPRING_K = 160; // spring stiffness pulling the body under the pointer
export const GRAB_SPRING_C = 16; // velocity damping (slightly underdamped so it bobs)
export const GRAB_DRAG_THRESHOLD = 4; // pointer travel (px) before a press becomes a grab
export const GRAB_DEPTH = 40; // render above every floor-sorted entity while airborne
export const GRAB_WORLD_BOUNDS: Bounds = CONTROL_WORLD_BOUNDS;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Floor point where a dangling avatar lands if released with the pointer here.
 * The anchor hangs REST_LENGTH below the pointer, the body centre sits below the anchor,
 * and the shadow (floor) sits LIFT_HEIGHT below the feet. Clamped to the walkable room.
 */
export function landingPoint(pointer: Point, anchorOffsetY: number, scale: number, bounds: Bounds = GRAB_WORLD_BOUNDS): Point {
  const drop = (GRAB_REST_LENGTH - anchorOffsetY + GRAB_LIFT_HEIGHT) * scale;
  return {
    x: clamp(pointer.x, bounds.minX, bounds.maxX),
    y: clamp(pointer.y + drop, bounds.minY, bounds.maxY),
  };
}

/** Body position that hovers LIFT_HEIGHT above a floor point. */
export function hangPoint(floor: Point, scale: number): Point {
  return { x: floor.x, y: floor.y - GRAB_LIFT_HEIGHT * scale };
}

/** Semi-implicit Euler step of a damped spring toward `target`. */
export function stepSpring(body: SpringState, target: Point, dt: number): void {
  const ax = (target.x - body.x) * GRAB_SPRING_K - body.vx * GRAB_SPRING_C;
  const ay = (target.y - body.y) * GRAB_SPRING_K - body.vy * GRAB_SPRING_C;
  body.vx += ax * dt;
  body.vy += ay * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

/** Gravity step toward the floor; returns true on the frame the body lands. */
export function stepFall(body: SpringState, floor: Point, dt: number): boolean {
  body.vy += GRAB_GRAVITY * dt;
  body.y += body.vy * dt;
  body.x += (floor.x - body.x) * Math.min(1, dt * 12);
  body.vx = 0;
  if (body.y >= floor.y) {
    body.x = floor.x;
    body.y = floor.y;
    body.vy = 0;
    return true;
  }
  return false;
}

export interface BandPixel extends Point {
  size: number;
}

export interface ElasticBand {
  pixels: BandPixel[];
  /** Current length / rest length. >1 is taut, <1 is slack. */
  stretch: number;
  width: number;
}

/**
 * Pixel-art elastic from `from` (the pointer) to `to` (the anchor): one integer-aligned block
 * per pixel along the major axis. A taut band thins to 1px; a slack band sags into a soft zigzag.
 */
export function elasticBand(from: Point, to: Point, restLength: number): ElasticBand {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const stretch = restLength > 0 ? length / restLength : 1;
  const width = stretch > 1.6 ? 1 : 2;
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const slack = stretch < 0.85;

  const pixels: BandPixel[] = [];
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = slack && i > 1 && i < steps - 1 && Math.floor(i / 3) % 2 === 1 ? 1 : 0;
    const x = Math.round(from.x + dx * t + (vertical ? wobble : 0));
    const y = Math.round(from.y + dy * t + (vertical ? 0 : wobble));
    if (x === lastX && y === lastY) continue;
    pixels.push({ x, y, size: width });
    lastX = x;
    lastY = y;
  }
  return { pixels, stretch, width };
}

/** The spot an avatar should walk back to: its in-flight destination, else where it stood. */
export function resolveReturnTarget(state: { isMoving: boolean; targetX: number; targetY: number; x: number; y: number }): Point {
  return state.isMoving ? { x: state.targetX, y: state.targetY } : { x: state.x, y: state.y };
}
