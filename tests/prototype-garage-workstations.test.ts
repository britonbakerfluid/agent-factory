import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import { factoryRoomAt, factoryScenePoint, factoryWorldPoint, fromFactoryWorld, GARAGE_LEVEL, GARAGE_STATIONS, WORKSTATIONS, toFactoryWorld, FACTORY_ELEVATOR, GARAGE_ELEVATOR, constrainFactoryStep, clearFactorySegment, routeToStation } from '../shared/factory25d-layout';
import { slotPosition } from '../shared/world-layouts';
import { garageElevatorPose } from '../client/prototypes/factory25dWorld';

function worker(state: StateManager, id: string) {
  state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: id, username: id, ownerId: `${id}-owner`, cwd: '/factory', avatar: DEFAULT_AVATAR });
}

describe('garage workstations', () => {
  it('appends garage slots without renumbering the existing factory and patio', () => {
    expect(WORKSTATIONS.slice(0,18).map(s=>s.id)).toEqual(['inside-0','inside-1','patio-0','inside-2','inside-3','patio-1','inside-4','inside-5','patio-2','inside-6','inside-7','patio-3','inside-8','inside-9','patio-4','inside-10','inside-11','patio-5']);
    expect(WORKSTATIONS.slice(18)).toEqual(GARAGE_STATIONS);
    const state = new StateManager('factory25d', () => 1000); worker(state, 'ada'); worker(state, 'grace');
    expect(state.getSnapshot().workstationCount).toBe(25);
    expect(state.assignWorkstation('ada',18)).toBe(true);
    expect(state.assignWorkstation('grace',18)).toBe(false);
    expect(state.assignWorkstation('grace',19)).toBe(true);
    for (let index=0;index<4;index++) { worker(state,`window-${index}`); expect(state.assignWorkstation(`window-${index}`,20+index)).toBe(true); }
    const before = state.getSnapshot();
    const restored = new StateManager('factory25d', () => 2000); restored.restoreWorld(before);
    expect(restored.get('ada')?.world.slotIndex).toBe(18);
    expect(restored.get('ada')?.ownerId).toBe('ada-owner');
    expect(restored.get('ada')?.avatar).toEqual(DEFAULT_AVATAR);
    expect(factoryScenePoint(fromFactoryWorld(slotPosition('factory25d','work',18)))).toEqual({ x: expect.closeTo(-3.8), z: expect.closeTo(13.2) });
    expect(factoryScenePoint(fromFactoryWorld(slotPosition('factory25d','work',19)))).toEqual({ x: expect.closeTo(-1.8), z: expect.closeTo(13.2) });
    for (const [index,x] of [-6.3,-2.1,2.1,6.3].entries()) {
      expect(restored.get(`window-${index}`)?.world.slotIndex).toBe(20+index);
      expect(factoryScenePoint(fromFactoryWorld(slotPosition('factory25d','work',20+index)))).toEqual({x:expect.closeTo(x),z:expect.closeTo(-2.2)});
    }
  });

  it('keeps local pointer projection and manual movement on the lower floor', () => {
    const local = { x:-3.8,z:13.2 }, world = factoryWorldPoint(local,'garage');
    expect(factoryRoomAt(world)).toBe('garage');
    expect(factoryScenePoint(world)).toEqual({x: expect.closeTo(local.x),z: expect.closeTo(local.z)});
    const move = fromFactoryWorld(constrainFactoryStep(toFactoryWorld(world), toFactoryWorld({x:-3.5,z:37.2})));
    expect(factoryScenePoint(move)).toEqual({x: expect.closeTo(-3.5),z:expect.closeTo(13.2)});
    const bounded = fromFactoryWorld(constrainFactoryStep(toFactoryWorld({x:7,z:20}),toFactoryWorld({x:20,z:14})));
    expect(factoryRoomAt(bounded)).toBe('garage');
    expect(bounded.x).toBeLessThanOrEqual(11.8);
    expect(bounded.z).toBeGreaterThanOrEqual(19.7);
    const front=fromFactoryWorld(constrainFactoryStep(toFactoryWorld({x:0,z:39}),toFactoryWorld({x:0,z:50})));
    expect(factoryScenePoint(front).z).toBeCloseTo(16);
    const upper=fromFactoryWorld(constrainFactoryStep(toFactoryWorld({x:-7,z:3}),toFactoryWorld({x:-11,z:3})));
    expect(upper.x).toBeCloseTo(-7.8);
    expect(clearFactorySegment({x:-7,z:3},{x:-11,z:3})).toBe(false);
    expect(clearFactorySegment({x:7,z:13.6},{x:7,z:15})).toBe(false);
    const inCar={x:-4.6,z:24};
    expect(routeToStation(inCar,FACTORY_ELEVATOR)).toEqual([inCar]);
  });

  it('hides elevator passengers in the shaft and places them at the correct door on arrival', () => {
    const state = new StateManager('factory25d',()=>1000); worker(state,'ada');
    const agent = state.get('ada')!;
    agent.world.movement={from:toFactoryWorld(FACTORY_ELEVATOR),to:toFactoryWorld(GARAGE_ELEVATOR),startedAt:1000,arrivesAt:3000};
    expect(garageElevatorPose(agent,1000,'factory25d')).toMatchObject({x:expect.closeTo(FACTORY_ELEVATOR.x),z:expect.closeTo(-2.9),room:'factory',hidden:false});
    const inTransit=garageElevatorPose(agent,1800,'factory25d');
    expect(inTransit).toMatchObject({x:expect.closeTo(FACTORY_ELEVATOR.x),z:expect.closeTo(-4.1),room:'factory',hidden:true});
    expect(garageElevatorPose(agent,3000,'factory25d')).toMatchObject({x:expect.closeTo(-10.5),z:expect.closeTo(-2.9),room:'garage',floor:GARAGE_LEVEL+.018,hidden:false});
    agent.world.movement={from:toFactoryWorld(GARAGE_ELEVATOR),to:toFactoryWorld(FACTORY_ELEVATOR),startedAt:1000,arrivesAt:3000};
    expect(garageElevatorPose(agent,1800,'factory25d')).toMatchObject({x:expect.closeTo(-10.5),hidden:true});
    expect(garageElevatorPose(agent,3000,'factory25d')).toMatchObject({x:expect.closeTo(FACTORY_ELEVATOR.x),room:'factory',hidden:false});
    agent.world.movement={from:toFactoryWorld({x:FACTORY_ELEVATOR.x,z:3}),waypoints:[toFactoryWorld(FACTORY_ELEVATOR)],to:toFactoryWorld(GARAGE_ELEVATOR),startedAt:1000,arrivesAt:3400};
    expect(garageElevatorPose(agent,1100,'factory25d')).toBeUndefined(); // The approach remains a normal walk.
    agent.manualControl={...agent.world.movement.to,facing:'up',moving:false};
    expect(garageElevatorPose(agent,2000,'factory25d')).toBeUndefined();
  });
});
