import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { WorldAgent, WorldMovement } from '../shared/types';
import { StateManager } from '../server/state';
import { BRAND_SHELF, FACTORY_ENTRANCE, FACTORY_ELEVATOR, GARAGE_ELEVATOR, clearFactorySegment, factory25dWaypoints, factoryMovementIsClear, fromFactoryWorld, recoverFactoryPosition, toFactoryWorld } from '../shared/factory25d-layout';
import { positionAt, slotPosition, WORLD_LAYOUTS } from '../shared/world-layouts';
import { agentPosition, factoryMovementForScene, garageElevatorPose } from '../client/prototypes/factory25dWorld';

const oldEntrance = toFactoryWorld({ x: 6.7, z: 12.8 });
function movement(from = oldEntrance, to = slotPosition('factory25d', 'work', 0)): WorldMovement {
  return { from, to, waypoints: factory25dWaypoints(from, to), startedAt: 1000, arrivesAt: 11000 };
}
function agent(move?: WorldMovement): WorldAgent {
  return { sessionId: 'path-fixture', username: 'fixture', cwd: '/fixture', avatar: DEFAULT_AVATAR, activity: 'writing', subagents: [],
    startedAt: 1000, lastEventAt: 1000, world: { zone: 'work', slotIndex: 0, facing: 'up', position: move?.from ?? oldEntrance, movement: move } };
}

describe('visible factory arrivals and safe server paths', () => {
  it('walks around the brand shelf while keeping the front-counter entrance clear', () => {
    // Start in the service aisle behind the cabinet, clear of the room divider.
    const from = toFactoryWorld({ x:BRAND_SHELF.x, z:BRAND_SHELF.z-.6 });
    const to = toFactoryWorld({ x:BRAND_SHELF.x, z:BRAND_SHELF.z+.9 });
    expect(clearFactorySegment(fromFactoryWorld(from), fromFactoryWorld(to))).toBe(false);
    const waypoints = factory25dWaypoints(from, to);
    expect(waypoints.length).toBeGreaterThan(0);
    expect(factoryMovementIsClear({from, to, waypoints})).toBe(true);
    expect(clearFactorySegment({x:-6.9,z:5.15}, {x:-6.9,z:6.1})).toBe(true);
    const recovered = fromFactoryWorld(recoverFactoryPosition(toFactoryWorld(BRAND_SHELF)));
    expect(clearFactorySegment(recovered, recovered)).toBe(true);
  });

  it('starts new sessions inside the visible open doorway, instead of below the cutaway frame', () => {
    const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
    camera.position.set(0, 9, 14.6); camera.lookAt(0, .35, .45); camera.updateMatrixWorld();
    const screen = new THREE.Vector3(FACTORY_ENTRANCE.x, .018, FACTORY_ENTRANCE.z).project(camera);
    expect(Math.abs(screen.x)).toBeLessThan(1); expect(Math.abs(screen.y)).toBeLessThan(1);
    expect(new THREE.Vector3(6.7, .018, 12.8).project(camera).y).toBeLessThan(-1);
    expect(clearFactorySegment(FACTORY_ENTRANCE, { x: 8.35, z: -2.5 })).toBe(true);
    expect(WORLD_LAYOUTS.factory25d.entrance).toEqual(toFactoryWorld(FACTORY_ENTRANCE));
    const state = new StateManager('factory25d', () => 1000);
    state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'new-arrival', username: 'fixture', cwd: '/fixture', avatar: DEFAULT_AVATAR });
    expect(state.get('new-arrival')!.world.movement?.from).toEqual(WORLD_LAYOUTS.factory25d.entrance);
    expect(factoryMovementIsClear(state.get('new-arrival')!.world.movement!)).toBe(true);
  });

  it('reroutes only the exact old arrival while retaining its destination and server timing', () => {
    const original = movement(), saved = structuredClone(original), adapted = factoryMovementForScene(original);
    expect(adapted.from).toEqual(toFactoryWorld(FACTORY_ENTRANCE)); expect(adapted.to).toEqual(original.to);
    expect(adapted.startedAt).toBe(original.startedAt); expect(adapted.arrivesAt).toBe(original.arrivesAt);
    expect(factoryMovementIsClear(adapted)).toBe(true); expect(original).toEqual(saved);
    expect(factoryMovementForScene(original)).toBe(adapted);
    expect(agentPosition(agent(original), 1000, 'factory25d')).toEqual(fromFactoryWorld(toFactoryWorld(FACTORY_ENTRANCE)));
    expect(agentPosition(agent(original), 11000, 'factory25d')).toEqual(fromFactoryWorld(original.to));
    const nearby = movement(toFactoryWorld({ x: 6.65, z: 12.8 }));
    expect(factoryMovementForScene(nearby)).toBe(nearby);
  });

  it('preserves valid live patrol waypoints, progress and idle positions', () => {
    const from=toFactoryWorld({x:12.7,z:7.7}),to=toFactoryWorld({x:1.7,z:10.7});
    const patrol: WorldMovement = {from,to,startedAt:1000,arrivesAt:21000,waypoints:factory25dWaypoints(from,to)};
    expect(factoryMovementIsClear(patrol)).toBe(true); expect(factoryMovementForScene(patrol)).toBe(patrol);
    for (const now of [1000, 3000, 7000, 15000, 21000]) expect(agentPosition(agent(patrol), now, 'factory25d')).toEqual(fromFactoryWorld(positionAt(patrol, now)));
    const idle = agent(); idle.world.zone = 'idle';
    expect(agentPosition(idle, 1000, 'factory25d')).toEqual(fromFactoryWorld(oldEntrance));
    idle.world.zone = 'entrance'; expect(agentPosition(idle, 1000, 'factory25d')).toEqual(fromFactoryWorld(toFactoryWorld(FACTORY_ENTRANCE)));
    idle.manualControl = { ...oldEntrance, facing: 'down', moving: false };
    expect(agentPosition(idle, 1000, 'factory25d')).toEqual(fromFactoryWorld(oldEntrance));
  });

  it('routes a stale direct leg through the existing wall opening', () => {
    const stale: WorldMovement = { from: toFactoryWorld({ x: -3.3, z: 2.83 }), to: toFactoryWorld({ x: 2.7, z: 10.7 }), startedAt: 1000, arrivesAt: 11000 };
    expect(factoryMovementIsClear(stale)).toBe(false);
    const safe = factoryMovementForScene(stale);
    expect(safe.from).toEqual(stale.from); expect(safe.to).toEqual(stale.to);
    expect(factoryMovementIsClear(safe)).toBe(true); expect(safe.waypoints!.length).toBeGreaterThan(0);
    for (let now = 1000; now <= 11000; now += 100) {
      const point = agentPosition(agent(stale), now, 'factory25d');
      expect(clearFactorySegment(point, point)).toBe(true);
    }
  });

  it('recovers old poses beyond either floor edge without changing valid poses', () => {
    for (const point of [{ x: 6.7, z: 15.2 }, { x: -13, z: 24 }, { x: 2, z: 40.8 }, { x: 1, z: 5.5 }]) {
      const recovered = fromFactoryWorld(recoverFactoryPosition(toFactoryWorld(point)));
      expect(clearFactorySegment(recovered, recovered)).toBe(true);
      expect(recovered.z >= 18).toBe(point.z >= 18);
    }
    const valid = toFactoryWorld({ x: 6.7, z: 12.5 }); expect(recoverFactoryPosition(valid)).toBe(valid);
  });

  it('rebuilds server work routes from invalid origins instead of issuing a direct wall-crossing fallback', () => {
    const state = new StateManager('factory25d', () => 1000);
    const hook = { session_id: 'worker', username: 'fixture', cwd: '/fixture', avatar: DEFAULT_AVATAR };
    state.handleHookEvent({ ...hook, hook_event_name: 'SessionStart' });
    const session = state.get('worker')!;
    session.world = { zone: 'idle', facing: 'up', position: toFactoryWorld({ x: 6.7, z: 15.2 }) };
    state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    const routed = state.get('worker')!.world.movement!;
    expect(fromFactoryWorld(routed.from).z).toBeCloseTo(13.7);
    expect(factoryMovementIsClear(routed)).toBe(true);
    // Even when its target is unchanged, a stale route must not survive a hook update.
    session.world.movement = { ...routed, from: toFactoryWorld({ x: -3.3, z: 7.5 }), waypoints: undefined };
    state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    expect(factoryMovementIsClear(state.get('worker')!.world.movement!)).toBe(true);
  });

  it('keeps a repaired garage route inside the elevator during its floor crossing', () => {
    const stale: WorldMovement = { from: toFactoryWorld({ x: -4, z: -3 }), to: slotPosition('factory25d', 'work', 18), startedAt: 1000, arrivesAt: 11000 };
    const safe = factoryMovementForScene(stale), path = [safe.from, ...(safe.waypoints ?? []), safe.to].map(fromFactoryWorld);
    const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
    const liftIndex = path.findIndex(p => Math.hypot(p.x - FACTORY_ELEVATOR.x, p.z - FACTORY_ELEVATOR.z) < .001);
    expect(path[liftIndex + 1]).toEqual(GARAGE_ELEVATOR);
    const progress = (lengths.slice(0, liftIndex).reduce((a, b) => a + b, 0) + lengths[liftIndex] / 2) / lengths.reduce((a, b) => a + b, 0);
    expect(garageElevatorPose(agent(stale), 1000 + progress * 10000, 'factory25d')).toMatchObject({ hidden: false, room: 'garage', x: GARAGE_ELEVATOR.x, z: expect.closeTo(-4.1) });
  });

  it('waits safely if a workstation destination itself becomes blocked', () => {
    const original = WORLD_LAYOUTS.factory25d.workSlots[0];
    // Simulate a saved desk anchor that a later room update put inside a wall.
    const blocked = toFactoryWorld({ x: 0, z: 5.5 });
    WORLD_LAYOUTS.factory25d.workSlots[0] = { x: blocked.x, y: blocked.y - 24 };
    try {
      const state = new StateManager('factory25d', () => 1000);
      const hook = { session_id: 'blocked-desk', username: 'fixture', cwd: '/fixture', avatar: DEFAULT_AVATAR };
      state.handleHookEvent({ ...hook, hook_event_name: 'SessionStart' });
      const before = state.get('blocked-desk')!.world.position;
      state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
      expect(state.get('blocked-desk')!.world.movement).toBeUndefined();
      expect(state.get('blocked-desk')!.world.position).toEqual(before);
      const point = fromFactoryWorld(before); expect(clearFactorySegment(point, point)).toBe(true);
    } finally { WORLD_LAYOUTS.factory25d.workSlots[0] = original; }
  });
});
