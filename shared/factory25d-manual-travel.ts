import type { ManualElevatorTrip, Position } from './types.js';
import {
  FACTORY_ELEVATOR, GARAGE_ELEVATOR, factoryRoomAt, factoryScenePoint,
  fromFactoryWorld, toFactoryWorld,
} from './factory25d-layout.js';

export const MANUAL_ELEVATOR_DURATION_MS = 1770;
export const MANUAL_ELEVATOR_SWITCH_MS = 760;
const ENTRY_Z = -3.2;
const ENTRY_HALF_WIDTH = .45;

/** Enter through the front of the door while walking toward the back wall. */
export function manualElevatorEntry(from: Position, to: Position): Pick<ManualElevatorTrip, 'departure' | 'arrival'> | undefined {
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return;
  const start = fromFactoryWorld(from), end = fromFactoryWorld(to);
  const room = factoryRoomAt(start);
  if (room === 'patio' || factoryRoomAt(end) !== room) return;
  const a = factoryScenePoint(start), b = factoryScenePoint(end);
  const door = room === 'garage' ? GARAGE_ELEVATOR : FACTORY_ELEVATOR;
  if (a.z < ENTRY_Z || b.z >= ENTRY_Z || b.z >= a.z) return;
  if (Math.abs(a.x - door.x) > ENTRY_HALF_WIDTH || Math.abs(b.x - door.x) > ENTRY_HALF_WIDTH) return;
  return {
    departure: { ...from },
    arrival: toFactoryWorld(room === 'garage' ? FACTORY_ELEVATOR : GARAGE_ELEVATOR),
  };
}

/** Cancel, disconnect, and takeover always settle at a door, never in the shaft. */
export function manualElevatorLanding(trip: ManualElevatorTrip, now: number): Position {
  return { ...(now < trip.startedAt + MANUAL_ELEVATOR_SWITCH_MS ? trip.departure : trip.arrival) };
}
