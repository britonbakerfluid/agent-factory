const CONTROL_WORLD_BOUNDS = { minX:-Infinity,maxX:Infinity,minY:-Infinity,maxY:Infinity };

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
export const GRAB_MAX_STRETCH = 1.4; // fabric can give a little, but never turns into a long elastic cord
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

/**
 * Keep the grabbed collar/hair within the fabric's maximum reach. Any velocity
 * still moving away from the pointer is removed so the body follows cleanly
 * instead of repeatedly bouncing against the limit.
 */
export function limitFabricStretch(
  body: SpringState,
  pointer: Point,
  anchorOffsetY: number,
  scale: number,
  maxStretch = GRAB_MAX_STRETCH,
): void {
  const anchorOffset = anchorOffsetY * scale;
  const dx = body.x - pointer.x;
  const dy = body.y + anchorOffset - pointer.y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = GRAB_REST_LENGTH * scale * maxStretch;
  if (distance <= maxDistance || distance === 0) return;

  const nx = dx / distance;
  const ny = dy / distance;
  body.x = pointer.x + nx * maxDistance;
  body.y = pointer.y + ny * maxDistance - anchorOffset;

  const outwardVelocity = body.vx * nx + body.vy * ny;
  if (outwardVelocity > 0) {
    body.vx -= outwardVelocity * nx;
    body.vy -= outwardVelocity * ny;
  }
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

export interface FabricWedge {
  tip: Point;
  leftShoulder: Point;
  centerShoulder: Point;
  rightShoulder: Point;
  /** Current length / rest length. >1 is taut, <1 is slack. */
  stretch: number;
}

/**
 * A pinched piece of fabric: the pointer is the narrow top point and the avatar's
 * shoulders/hair form the wide base. Keeping the base horizontal makes it read as
 * clothing being lifted rather than a rope attached to the avatar.
 */
export function fabricWedge(from: Point, to: Point, halfWidth: number, restLength: number): FabricWedge {
  const tip = { x: Math.round(from.x), y: Math.round(from.y) };
  const centerShoulder = { x: Math.round(to.x), y: Math.round(to.y) };
  const width = Math.max(2, Math.round(halfWidth));
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const stretch = restLength > 0 ? length / restLength : 1;
  return {
    tip,
    leftShoulder: { x: centerShoulder.x - width, y: centerShoulder.y },
    centerShoulder,
    rightShoulder: { x: centerShoulder.x + width, y: centerShoulder.y },
    stretch,
  };
}

/** The spot an avatar should walk back to: its in-flight destination, else where it stood. */
export function resolveReturnTarget(state: { isMoving: boolean; targetX: number; targetY: number; x: number; y: number }): Point {
  return state.isMoving ? { x: state.targetX, y: state.targetY } : { x: state.x, y: state.y };
}
