import { describe, expect, it } from 'vitest';
import { FACTORY_ELEVATOR, GARAGE_ELEVATOR, GARAGE_LEVEL, factoryWorldPoint, fromFactoryWorld, toFactoryWorld } from '../shared/factory25d-layout';
import type { WorldAgent } from '../shared/types';
import { elevatorApproachOpenness, ManualRoomFollower } from '../client/prototypes/factory25dManualTravel';
import { agentPosition, garageElevatorPose } from '../client/prototypes/factory25dWorld';
import { elevatorTrip } from '../client/prototypes/factory25dElevatorTrip';

function controlled(x: number, z: number, sessionId = 'mine'): WorldAgent {
  const point = toFactoryWorld({ x, z });
  return { sessionId, manualControl: { ...point, facing: 'up', moving: false },
    world: { zone: 'manual', position: point, facing: 'up' } } as WorldAgent;
}

function passenger(fromGarage = false) {
  const from = fromGarage ? GARAGE_ELEVATOR : FACTORY_ELEVATOR;
  const to = fromGarage ? FACTORY_ELEVATOR : GARAGE_ELEVATOR;
  const agent = controlled(from.x + .2, from.z - .24);
  agent.manualControl!.elevatorTrip = { departure: toFactoryWorld({ x: from.x + .2, z: from.z - .24 }),
    arrival: toFactoryWorld(to), startedAt: 1000, arrivesAt: 2770 };
  return agent;
}

describe('following a controlled agent through the factory', () => {
  it('follows the patio doorway in both directions without jitter at the threshold', () => {
    const follow = new ManualRoomFollower();
    expect(follow.update(controlled(7.6, -2.5), 'factory25d')).toBe('factory');
    expect(follow.update(controlled(8.05, -2.5), 'factory25d')).toBeUndefined();
    expect(follow.update(controlled(8.3, -2.5), 'factory25d')).toBe('patio');
    expect(follow.update(controlled(7.95, -2.5), 'factory25d')).toBeUndefined();
    expect(follow.update(controlled(7.7, -2.5), 'factory25d')).toBe('factory');
  });

  it('requests one elevator transition and keeps that destination through arrival', () => {
    for (const downstairs of [true, false]) {
      const follow = new ManualRoomFollower(), agent = passenger(!downstairs);
      const destination = downstairs ? 'garage' : 'factory';
      expect(follow.update(agent, 'factory25d')).toBe(destination);
      expect(follow.update(agent, 'factory25d')).toBeUndefined();
      const arrival = agent.manualControl!.elevatorTrip!.arrival;
      agent.manualControl = { ...arrival, moving: false, facing: 'down' };
      expect(follow.update(agent, 'factory25d')).toBeUndefined();
    }
  });

  it('lets the viewer browse independently until their agent crosses a room again', () => {
    const follow = new ManualRoomFollower(), agent = controlled(2, 3);
    expect(follow.update(agent, 'factory25d')).toBe('factory');
    for (let i = 0; i < 10; i++) expect(follow.update(agent, 'factory25d')).toBeUndefined();
    expect(follow.update(undefined, 'factory25d')).toBeUndefined();
    expect(follow.update(agent, 'factory25d')).toBe('factory');
    expect(follow.update(agent, 'arcade')).toBeUndefined();
    delete agent.manualControl;
    expect(follow.update(agent, 'factory25d')).toBeUndefined();
  });
});

describe('a passenger behind the elevator doors', () => {
  it('walks into the opening, remains behind the shaft, and exits on the destination floor', () => {
    for (const fromGarage of [false, true]) {
      const agent = passenger(fromGarage), trip = agent.manualControl!.elevatorTrip!;
      expect(agentPosition(agent, 1000, 'factory25d')).toEqual(fromFactoryWorld(trip.departure));
      expect(garageElevatorPose(agent, 1120, 'factory25d')!.z).toBeCloseTo(-3.14); // Wait while the doors open.
      const entry = garageElevatorPose(agent, 1280, 'factory25d')!;
      expect(entry).toMatchObject({ room: fromGarage ? 'garage' : 'factory', hidden: false });
      expect(entry.z).toBeLessThan(-3.14);
      expect(garageElevatorPose(agent, 1700, 'factory25d')).toMatchObject({ hidden: true, room: fromGarage ? 'garage' : 'factory' });
      expect(garageElevatorPose(agent, 1800, 'factory25d')).toMatchObject({ hidden: true, room: fromGarage ? 'factory' : 'garage' });
      expect(garageElevatorPose(agent, 2350, 'factory25d')).toMatchObject({ hidden: false, room: fromGarage ? 'factory' : 'garage', floor: fromGarage ? .018 : GARAGE_LEVEL + .018 });
      expect(agentPosition(agent, 2770, 'factory25d')).toEqual(fromFactoryWorld(trip.arrival));
      const pose = garageElevatorPose(agent, 2770, 'factory25d')!;
      expect(factoryWorldPoint(pose, pose.room)).toEqual(fromFactoryWorld(trip.arrival));
    }
  });

  it('opens only the nearby lift on the controlled agent’s floor', () => {
    expect(elevatorApproachOpenness(controlled(FACTORY_ELEVATOR.x, -3.05), 'factory')).toBe(1);
    expect(elevatorApproachOpenness(controlled(FACTORY_ELEVATOR.x, -3.05), 'garage')).toBe(0);
    expect(elevatorApproachOpenness(controlled(0, 3), 'factory')).toBe(0);
    expect(elevatorApproachOpenness(controlled(GARAGE_ELEVATOR.x, GARAGE_ELEVATOR.z), 'garage')).toBeGreaterThan(.9);
    expect(elevatorApproachOpenness(passenger(), 'factory')).toBe(0);
    expect(elevatorApproachOpenness(undefined, 'factory')).toBe(0);
  });

  it('keeps reduced-motion passengers synchronized with the server, without camera movement', () => {
    for (const fromGarage of [false, true]) {
      const before = elevatorTrip(759, fromGarage, !fromGarage, true, true);
      const switchFrame = elevatorTrip(760, fromGarage, !fromGarage, true, true);
      expect(before.garage).toBe(fromGarage);
      expect(switchFrame).toMatchObject({ garage: !fromGarage, veil: 1, lift: 0, done: false });
      expect(elevatorTrip(1770, fromGarage, !fromGarage, true, true)).toMatchObject({ done: true, veil: 0, lift: 0 });
    }
  });
});
