import { MAX_BROADCAST_RATE_MS } from '@shared/constants';
import { clearFactorySegment, factory25dWaypoints, factoryMovementIsClear, factoryRoomAt, fromFactoryWorld, recoverFactoryPosition } from '@shared/factory25d-layout';
import type { FacingDirection, ManualControlState, Position, WorldMovement } from '@shared/types';
import { positionAt } from '@shared/world-layouts';

type Sample = Position & { at: number; facing: FacingDirection; moving: boolean; route?: WorldMovement };
export type ManualMotionPose = Position & { facing: FacingDirection; moving: boolean };

// The server sends 10 positions per second. Keep one update plus a small jitter
// margin so display frames follow a continuous path between confirmed positions.
export const MANUAL_INTERPOLATION_MS = MAX_BROADCAST_RATE_MS + 20;
const MAX_SAMPLES = 32;
const MAX_BRIDGE_DISTANCE = 32;

/** Presentation only: never changes the shared position or predicts through a wall. */
export class ManualMotionBuffer {
  private samples: Sample[] = [];
  private clockOffset = -Infinity;
  private lastPose?: ManualMotionPose;
  private lastRenderAt = -Infinity;

  clear() {
    this.samples = []; this.clockOffset = -Infinity;
    this.lastPose = undefined; this.lastRenderAt = -Infinity;
  }

  push(control: ManualControlState | undefined, serverTime: number, receivedAt: number) {
    if (!control || control.elevatorTrip) { this.clear(); return; }
    if (![control.x, control.y, serverTime, receivedAt].every(Number.isFinite)) return;
    control={...control,...recoverFactoryPosition(control)};
    let previous = this.samples.at(-1);
    if (previous && serverTime < previous.at) return;
    // Estimate a monotonic server clock from the least-delayed received sample.
    // A late packet must not turn animation time backwards.
    this.clockOffset = Math.max(this.clockOffset, serverTime - receivedAt);
    if (previous && control.x === previous.x && control.y === previous.y
      && control.facing === previous.facing && control.moving === previous.moving) return;
    if (previous && (Math.hypot(control.x - previous.x, control.y - previous.y) > MAX_BRIDGE_DISTANCE
      || (factoryRoomAt(fromFactoryWorld(previous)) === 'garage') !== (factoryRoomAt(fromFactoryWorld(control)) === 'garage'))) {
      this.clear(); this.clockOffset = serverTime - receivedAt; previous = undefined;
    }
    const next: Sample = { x: control.x, y: control.y, facing: control.facing, moving: control.moving, at: serverTime };
    if (previous && serverTime - previous.at > MAX_BROADCAST_RATE_MS * 3) {
      // Starting after an idle spell or a stalled connection isn't a multi-second
      // walk. Bridge the short correction over one update; large moves reset above.
      previous = { ...previous, at: serverTime - MAX_BROADCAST_RATE_MS, route: undefined };
      this.samples = [previous];
    }
    if (previous && serverTime > previous.at) {
      const waypoints = clearFactorySegment(fromFactoryWorld(previous), fromFactoryWorld(next))
        ? undefined : factory25dWaypoints(previous, next);
      next.route = { from: { x: previous.x, y: previous.y }, to: { x: next.x, y: next.y },
        startedAt: previous.at, arrivesAt: serverTime, ...(waypoints ? { waypoints } : {}) };
      if (!factoryMovementIsClear(next.route)) {
        // An authoritative relocation with no safe connecting path is a reset,
        // not permission to draw a walk through solid geometry.
        this.clear(); this.clockOffset = serverTime - receivedAt; previous = undefined;
        delete next.route;
      }
    }
    if (previous?.at === serverTime) this.samples[this.samples.length - 1] = next;
    else this.samples.push(next);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  sample(now: number): ManualMotionPose | undefined {
    const first = this.samples[0], latest = this.samples.at(-1);
    if (!first || !latest) return;
    const at = Math.max(this.lastRenderAt, now + this.clockOffset - MANUAL_INTERPOLATION_MS);
    this.lastRenderAt = at;
    let a = first, b = first;
    for (let index = 1; index < this.samples.length; index++) {
      const sample = this.samples[index];
      b = sample;
      if (sample.at >= at) break;
      a = sample;
    }
    const point = at <= first.at ? first : at >= latest.at ? latest
      : b.route ? positionAt(b.route, at) : a;
    // Facing is explicit state, not inferred from the zero-distance frames
    // between network packets (which used to flip the sprite upward).
    const facing = at > a.at ? b.facing : a.facing;
    const travelled = !!this.lastPose && Math.hypot(point.x - this.lastPose.x, point.y - this.lastPose.y) > .005;
    // A briefly late packet freezes the current foot pose, rather than
    // snapping to standing and back. Never advance the position or keep this
    // presentation hold after a confirmed stop or a longer connection stall.
    const hold = !!this.lastPose?.moving && latest.moving && at - latest.at <= MANUAL_INTERPOLATION_MS;
    const moving = travelled || hold;
    const pose = { x: point.x, y: point.y, facing, moving };
    this.lastPose = pose;
    return pose;
  }
}
