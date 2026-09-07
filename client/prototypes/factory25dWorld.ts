import { fromFactoryWorld, toFactoryWorld, factoryScenePoint, factoryRoomAt, factoryElevatorTripAt, factory25dWaypoints, factoryMovementIsClear, recoverFactoryPosition, FACTORY_ENTRANCE, GARAGE_LEVEL, type FactoryRoom } from '@shared/factory25d-layout';
import { positionAt } from '@shared/world-layouts';
import type { EnvironmentType, Position, WorldAgent, WorldMovement } from '@shared/types';
import { slotPosition } from '@shared/world-layouts';
import { WORKSTATIONS, routeToStation } from './factory25dWorkstations';
import { manualElevatorPresentation, elevatorPassengerPresentation } from './factory25dManualTravel';

export type RoomPoint = { x: number; z: number };
const oldEntrance = toFactoryWorld({ x: 6.7, z: 12.8 });
const isOldEntrance = (point: Position) => Math.hypot(point.x - oldEntrance.x, point.y - oldEntrance.y) < .001;
const sceneMovements = new WeakMap<WorldMovement, WorldMovement>();

/** Keep valid server routes intact; older servers may still use the hidden front entrance or an older floor plan. */
export function factoryMovementForScene(movement: WorldMovement): WorldMovement {
  const cached = sceneMovements.get(movement);
  if (cached) return cached;
  let result = movement;
  if (isOldEntrance(movement.from) || !factoryMovementIsClear(movement)) {
    const from = recoverFactoryPosition(isOldEntrance(movement.from) ? toFactoryWorld(FACTORY_ENTRANCE) : movement.from);
    const to = recoverFactoryPosition(movement.to);
    result = { ...movement, from, to, waypoints: factory25dWaypoints(from, to) };
    // A failed visibility route is a stationary pose, never a direct walk through its obstacle.
    if (!factoryMovementIsClear(result)) result = { ...movement, from, to: from, waypoints: undefined };
  }
  sceneMovements.set(movement, result);
  return result;
}
export function projectPosition(point: Position, environment: EnvironmentType = 'arcade'): RoomPoint {
  if (environment === 'factory25d') return fromFactoryWorld(point);
  // Preserve server slot IDs across both views, including automatic overflow slots.
  for (let slot = 0; slot < WORKSTATIONS.length; slot++) {
    const stance = slotPosition(environment, 'work', slot);
    if (Math.hypot(point.x - stance.x, point.y - stance.y) < 2) {
      const station = WORKSTATIONS[slot];
      return { x: station.x, z: station.z + 0.55 };
    }
  }
  if (point.y >= 350) return { x: (point.x - 400) / 48, z: 6.1 + (point.y - 350) / 17 };
  return { x: (point.x - 400) / 58, z: -4.2 + (point.y - 58) / 39 };
}

export function pointAlong(path: RoomPoint[], progress: number): RoomPoint {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
  let distance = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, distance / lengths[i]) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * t, z: path[i].z + (path[i + 1].z - path[i].z) * t };
    }
    distance -= lengths[i];
  }
  return path.at(-1) ?? { x: 0, z: 12 };
}

export function projectMovement(movement: WorldMovement, now: number, environment: EnvironmentType): RoomPoint {
  if (environment === 'factory25d') return fromFactoryWorld(positionAt(factoryMovementForScene(movement), now));
  const from = projectPosition(movement.from, environment), to = projectPosition(movement.to, environment);
  const duration = movement.arrivesAt - movement.startedAt;
  return pointAlong([from, ...routeToStation(from, to)], duration <= 0 ? 1 : (now - movement.startedAt) / duration);
}

export function agentPosition(agent: WorldAgent, now: number, environment: EnvironmentType): RoomPoint {
  const world = agent.world;
  if (environment === 'factory25d') {
    if (agent.manualControl) return manualElevatorPresentation(agent.manualControl, now)?.point ?? fromFactoryWorld(agent.manualControl);
    if (world.movement) return projectMovement(world.movement, now, environment);
    return fromFactoryWorld(recoverFactoryPosition(world.zone === 'entrance' && isOldEntrance(world.position) ? toFactoryWorld(FACTORY_ENTRANCE) : world.position));
  }
  if (agent.manualControl) {
    const anchor = projectPosition(world.position, environment);
    return { x: anchor.x + (agent.manualControl.x - world.position.x) / 48,
      z: anchor.z + (agent.manualControl.y - world.position.y) / 32 };
  }
  return world.movement ? projectMovement(world.movement, now, environment) : projectPosition(world.position, environment);
}

/** Elevator passengers stay behind the doors while the server crosses between floor strips. */
export function garageElevatorPose(agent: WorldAgent, now: number, environment: EnvironmentType): { x: number; z: number; floor: number; room: FactoryRoom; hidden: boolean; door: number; facing: 'up' | 'down'; walking: boolean } | undefined {
  if(environment!=='factory25d') return;
  if(agent.manualControl) {
    const pose=manualElevatorPresentation(agent.manualControl,now);if(!pose)return;
    return {...factoryScenePoint(pose.point),floor:pose.room==='garage'?GARAGE_LEVEL+.018:.018,room:pose.room,hidden:pose.hidden,door:pose.door,facing:pose.facing,walking:pose.walking};
  }
  if(!agent.world.movement)return;
  const trip=factoryElevatorTripAt(factoryMovementForScene(agent.world.movement),now); if(!trip) return;
  const pose=elevatorPassengerPresentation(toFactoryWorld(trip.departure),toFactoryWorld(trip.arrival),trip.progress*1770);
  return {...factoryScenePoint(pose.point),floor:pose.room==='garage'?GARAGE_LEVEL+.018:.018,room:pose.room,hidden:pose.hidden,door:pose.door,facing:pose.facing,walking:pose.walking};
}
