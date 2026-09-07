import { factoryRoomAt, factoryScenePoint, factoryWorldPoint, fromFactoryWorld, FACTORY_ELEVATOR, GARAGE_ELEVATOR, type FactoryRoom } from '@shared/factory25d-layout';
import { MANUAL_ELEVATOR_SWITCH_MS } from '@shared/factory25d-manual-travel';
import type { EnvironmentType, ManualControlState, WorldAgent } from '@shared/types';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** The passenger walks through the opening, then stays inside the shaft until the other doors open. */
export function manualElevatorPresentation(control: ManualControlState, now: number) {
  const trip = control.elevatorTrip;
  if (!trip) return undefined;
  const elapsed = now - trip.startedAt, arriving = elapsed >= MANUAL_ELEVATOR_SWITCH_MS;
  const landing = fromFactoryWorld(arriving ? trip.arrival : trip.departure);
  const room = factoryRoomAt(landing), local = factoryScenePoint(landing);
  const lift = room === 'garage' ? GARAGE_ELEVATOR : FACTORY_ELEVATOR;
  const progress = arriving ? smooth((elapsed - 1210) / 240) : smooth(elapsed / 240);
  const point = arriving
    ? { x: lift.x + (local.x - lift.x) * progress, z: -3.94 + (local.z + 3.94) * progress }
    : { x: local.x + (lift.x - local.x) * progress, z: local.z + (-3.94 - local.z) * progress };
  return { point: factoryWorldPoint(point, room), room, hidden: elapsed >= 240 && elapsed < 1210 };
}

/** Only follow actual crossings. Looking at another room never creates a stream of return requests. */
export class ManualRoomFollower {
  private sessionId?: string;
  private room?: FactoryRoom;
  private tripStartedAt?: number;

  update(agent: WorldAgent | undefined, environment?: EnvironmentType): FactoryRoom | undefined {
    if (environment !== 'factory25d' || !agent?.manualControl) {
      this.sessionId = this.room = undefined; this.tripStartedAt = undefined;
      return undefined;
    }
    const control = agent.manualControl, point = fromFactoryWorld(control);
    if (agent.sessionId !== this.sessionId) {
      this.sessionId = agent.sessionId; this.room = undefined; this.tripStartedAt = undefined;
    }
    if (control.elevatorTrip) {
      this.room = factoryRoomAt(fromFactoryWorld(control.elevatorTrip.arrival));
      if (this.tripStartedAt === control.elevatorTrip.startedAt) return undefined;
      this.tripStartedAt = control.elevatorTrip.startedAt;
      return this.room;
    }
    this.tripStartedAt = undefined;
    const next = factoryRoomAt(point);
    if (next === this.room) return undefined;
    // A little clearance prevents camera oscillation while standing on the patio threshold.
    if (this.room === 'factory' && next === 'patio' && point.x < 8.2) return undefined;
    if (this.room === 'patio' && next === 'factory' && point.x > 7.8) return undefined;
    this.room = next;
    return next;
  }
}

export function elevatorApproachOpenness(agent: WorldAgent | undefined, room: 'factory' | 'garage') {
  if (!agent?.manualControl || agent.manualControl.elevatorTrip) return 0;
  const point = fromFactoryWorld(agent.manualControl);
  if (factoryRoomAt(point) !== room) return 0;
  const local = factoryScenePoint(point), lift = room === 'garage' ? GARAGE_ELEVATOR : FACTORY_ELEVATOR;
  return smooth((1.35 - Math.hypot(local.x - lift.x, local.z + 3.7)) / .6);
}
