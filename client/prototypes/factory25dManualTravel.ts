import { factoryRoomAt, factoryScenePoint, factoryWorldPoint, fromFactoryWorld, FACTORY_ELEVATOR, GARAGE_ELEVATOR, type FactoryRoom } from '@shared/factory25d-layout';
import { MANUAL_ELEVATOR_SWITCH_MS } from '@shared/factory25d-manual-travel';
import { elevatorDoorAt } from './factory25dElevatorTrip';
import type { Position } from '@shared/types';
import type { EnvironmentType, ManualControlState, WorldAgent } from '@shared/types';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** The passenger walks through the opening, then stays inside the shaft until the other doors open. */
export function manualElevatorPresentation(control: ManualControlState, now: number) {
  const trip = control.elevatorTrip;
  if (!trip) return undefined;
  return elevatorPassengerPresentation(trip.departure, trip.arrival, now - trip.startedAt);
}

/** Shared by autonomous and controlled passengers, in the exact same physical doorway. */
export function elevatorPassengerPresentation(departure: Position, arrival: Position, elapsed: number) {
  const arriving = elapsed >= MANUAL_ELEVATOR_SWITCH_MS;
  const landing = fromFactoryWorld(arriving ? arrival : departure);
  const room = factoryRoomAt(landing), local = factoryScenePoint(landing);
  const lift = room === 'garage' ? GARAGE_ELEVATOR : FACTORY_ELEVATOR;
  const progress = arriving ? smooth((elapsed - 1070) / 380) : smooth((elapsed - 160) / 250);
  // Behind the metal panels, but in front of the cabin's back wall.
  const cabinZ = -4.10;
  const point = arriving
    ? { x: lift.x + (local.x - lift.x) * progress, z: cabinZ + (local.z - cabinZ) * progress }
    : { x: local.x + (lift.x - local.x) * progress, z: local.z + (cabinZ - local.z) * progress };
  return { point: factoryWorldPoint(point, room), room, hidden: elapsed >= 610 && elapsed < 850,
    door: elevatorDoorAt(elapsed), facing: arriving ? 'down' as const : 'up' as const,
    walking: arriving ? elapsed > 1070 && elapsed < 1450 : elapsed > 160 && elapsed < 410 };
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
