import {
  GRAB_WORLD_BOUNDS,
  hangPoint,
  landingPoint,
  stepFall,
  stepSpring,
} from './physics';
import type { Bounds, Point, SpringState } from './physics';

export type GrabPhase = 'idle' | 'held' | 'falling';

/** Anything the room can pick up. Implemented by AgentSprite and SubagentSprite. */
export interface Grabbable {
  readonly isGrabbed: boolean;
  readonly isHeld: boolean;
  beginGrab(pointer: Point): void;
  moveGrab(pointer: Point): void;
  releaseGrab(pointer?: Point): void;
  showGrabHint(text: string): void;
}

/**
 * Pure motion for one lifted avatar: a damped spring hangs the body under the pointer while
 * held, then gravity drops it onto the floor point derived from the release pointer.
 * Sprites read `body` each frame and apply it; no Phaser types live here so it is unit-testable.
 */
export class GrabMotion {
  phase: GrabPhase = 'idle';
  readonly pointer: Point = { x: 0, y: 0 };
  readonly body: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
  readonly floor: Point = { x: 0, y: 0 };

  constructor(
    private readonly anchorOffsetY: number,
    private readonly scale: number,
    private readonly bounds: Bounds = GRAB_WORLD_BOUNDS,
  ) {}

  /** Height of the body above its floor shadow. */
  get lift(): number {
    return Math.max(0, this.floor.y - this.body.y);
  }

  get hang(): Point {
    return hangPoint(this.floor, this.scale);
  }

  begin(pointer: Point, body: Point): void {
    this.body.x = body.x;
    this.body.y = body.y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.phase = 'held';
    this.setPointer(pointer);
  }

  setPointer(pointer: Point): void {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
    const floor = landingPoint(pointer, this.anchorOffsetY, this.scale, this.bounds);
    this.floor.x = floor.x;
    this.floor.y = floor.y;
  }

  release(pointer?: Point): void {
    if (this.phase === 'idle') return;
    if (pointer) this.setPointer(pointer);
    this.phase = 'falling';
    this.body.vy = Math.max(0, this.body.vy); // never launch upward on release
  }

  cancel(): void {
    this.phase = 'idle';
  }

  /** Advance by `dt` seconds. Returns 'landed' exactly once, on the frame the fall completes. */
  step(dt: number): GrabPhase | 'landed' {
    const clamped = Math.min(Math.max(dt, 0), 0.05);
    if (this.phase === 'held') {
      stepSpring(this.body, this.hang, clamped);
      return 'held';
    }
    if (this.phase === 'falling') {
      if (stepFall(this.body, this.floor, clamped)) {
        this.phase = 'idle';
        return 'landed';
      }
      return 'falling';
    }
    return 'idle';
  }
}
