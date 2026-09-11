import { expect, it } from 'vitest';
import { elevatorTrip } from '../client/prototypes/factory25dElevatorTrip';

it('hands camera navigation off as soon as the floor movement completes', () => {
  for (const destination of [false, true]) {
    const arrival = elevatorTrip(1210 * 1.35, !destination, destination);
    expect(arrival.done).toBe(true);
    expect(arrival.garage01).toBe(Number(destination));
    expect(elevatorTrip(1200 * 1.35, !destination, destination).done).toBe(false);
  }
});

it('preserves passenger timing and reduced-motion travel', () => {
  expect(elevatorTrip(1210, true, false, false, true).done).toBe(false);
  expect(elevatorTrip(1770, true, false, false, true).done).toBe(true);
  expect(elevatorTrip(240, true, false, true).done).toBe(true);
});
