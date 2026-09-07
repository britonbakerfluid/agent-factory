type Point = { x: number; z: number };

/** Four frames cover a .8-unit stride for the room's short-legged avatars. */
export const AVATAR_FRAME_DISTANCE = .2;

/** Reusing a directional pose at rest must not advance its feet. */
export function stationaryAvatarFrame(animation: string, elapsed: number, fps: number, reduced = false): number {
  if (reduced || fps <= 0 || !Number.isFinite(elapsed) || animation.startsWith('walk_')) return 0;
  if (animation === 'idle') {
    // The blink frame should close the eyes briefly, not for a full 1-fps beat.
    const period = Math.max(2.4, 8 / fps);
    return elapsed % period >= period - .12 ? 2 : 0;
  }
  return Math.floor(elapsed * fps) % 4;
}

/** Display-only gait. Each actor owns its phase; wall-clock time never advances a foot. */
export class AvatarWalkCycle {
  private previous?: Point & { at: number };
  private distance = 0;

  reset() { this.previous = undefined; this.distance = 0; }

  sample(point: Point, elapsed: number, walking: boolean, reduced = false, scale = 1): number {
    if (![point.x, point.z, elapsed].every(Number.isFinite)) { this.reset(); return 0; }
    const previous = this.previous;
    this.previous = { ...point, at: elapsed };
    const travelled = previous ? Math.hypot(point.x - previous.x, point.z - previous.z) : 0;
    // A hidden-tab resume, grab/drop or floor transfer is not a giant step.
    if (!previous || elapsed - previous.at > .25 || elapsed < previous.at || travelled > .75) {
      this.distance = 0; return 0;
    }
    // A confirmed stop settles the pose and starts the next walk from rest.
    if (!walking || reduced) { this.distance = 0; return 0; }
    // Interpolation can briefly reach its latest packet. Hold the planted pose
    // there instead of flashing frame zero and jumping back into the old step.
    if (elapsed > previous.at && travelled >= .00001) {
      const size = Number.isFinite(scale) ? Math.max(.1, scale) : 1;
      this.distance = (this.distance + travelled / size) % (AVATAR_FRAME_DISTANCE * 4);
    }
    return Math.floor((this.distance + 1e-8) / AVATAR_FRAME_DISTANCE) % 4;
  }
}
