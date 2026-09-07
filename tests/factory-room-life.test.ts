import { describe, expect, it } from 'vitest';
import { FACTORY_REST_STOPS } from '../shared/factory25d-rest';
import { FACTORY_ELEVATOR, GARAGE_ELEVATOR, clearFactorySegment, factory25dWaypoints, factoryMovementIsClear, toFactoryWorld } from '../shared/factory25d-layout';
import { elevatorPassengerPresentation } from '../client/prototypes/factory25dManualTravel';
import { garageElevatorPose } from '../client/prototypes/factory25dWorld';
import type { WorldAgent } from '../shared/types';

describe('purposeful room life', () => {
  it('keeps every rest stop reachable without crossing furniture or walls', () => {
    const from = toFactoryWorld({x:3,z:3});
    for (const stop of FACTORY_REST_STOPS) {
      const to = toFactoryWorld(stop);
      expect(clearFactorySegment(stop,stop)).toBe(true);
      expect(factoryMovementIsClear({from,to,waypoints:factory25dWaypoints(from,to)})).toBe(true);
    }
    expect(clearFactorySegment({x:.8,z:9},{x:.8,z:11})).toBe(false);
  });
  it.each([false,true])('opens before boarding, hides only behind closed doors, and clears the landing (upstairs: %s)', upstairs => {
    const from = toFactoryWorld(upstairs ? FACTORY_ELEVATOR : GARAGE_ELEVATOR);
    const to = toFactoryWorld(upstairs ? GARAGE_ELEVATOR : FACTORY_ELEVATOR);
    for (let time=0;time<=1770;time+=10) {
      const pose=elevatorPassengerPresentation(from,to,time);
      if(pose.walking) expect(pose.door).toBe(1);
      if(pose.hidden) expect(pose.door).toBe(0);
    }
    expect(elevatorPassengerPresentation(from,to,1770)).toMatchObject({hidden:false,walking:false,door:0});
    const auto={world:{movement:{from,to,startedAt:1000,arrivesAt:2770}}} as WorldAgent;
    for(const time of [0,280,700,800,1150,1400,1770]) {
      const pose=garageElevatorPose(auto,time+1000,'factory25d')!;
      const expected=elevatorPassengerPresentation(from,to,time);
      expect(pose).toMatchObject({room:expected.room,hidden:expected.hidden,facing:expected.facing,walking:expected.walking});
      expect(pose.door).toBeCloseTo(expected.door);
    }
  });
});
