import type { Position, WorldMovement } from './types.js';
import { PATIO_OBSTACLES } from './factory25d-patio.js';
import { GARAGE_CAR_IDS, GARAGE_CAR_BAYS, GARAGE_PARKED_BOUNDS } from './factory25d-garage.js';
export type FactoryRoom = 'factory' | 'patio' | 'garage';
export const GARAGE_LEVEL = -12;
export const GARAGE_WORLD_Z = 24;
export const MINI_WORKSTATION_ID = 'garage-mini';
export const MINI_WORKSTATION_USERNAME = 'jonathanvergara';
export const MINI_WORK_PACK_MS = 4_500;
export const MINI_WORK_RETRIEVAL_MS = 2_300;
// These matching door landings are connected by the elevator shaft.
export const GARAGE_MINI_LOOKOUTS = [-1.15, .35].map(x => ({ x, z: GARAGE_WORLD_Z + 3.05 }));
export const ELEVATOR_BODY = { width: 1.36, near: -4.5, far: -3.8 } as const;
export const FACTORY_ELEVATOR = { x: -7.1, z: -2.9 };
export const GARAGE_ELEVATOR = { x: -10.5, z: GARAGE_WORLD_Z - 2.9 };
// New arrivals enter through the visible, open patio doorway.
export const FACTORY_ENTRANCE = { x: 7.55, z: -2.5 };
export function factoryRoomAt(point: { x: number; z: number }): FactoryRoom { return point.z >= 18 ? 'garage' : point.x > 8 ? 'patio' : 'factory'; }
export function factoryScenePoint(point: { x: number; z: number }) { return { x: point.x, z: point.z - (factoryRoomAt(point) === 'garage' ? GARAGE_WORLD_Z : 0) }; }
export function factoryWorldPoint(point: { x: number; z: number }, room: FactoryRoom) { return { x: point.x, z: point.z + (room === 'garage' ? GARAGE_WORLD_Z : 0) }; }
export const INDOOR_COLUMNS = [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5];
export const INDOOR_ROWS = [-3.8, 0.33];
export const INTERIOR_Z = 1.95;
export const FRONT_COUNTER = { x: -2.42, z: 6.65, width: 3.36, depth: .42, topY: .53 } as const;
export const DJ_BOOTH = { x: 3.5, z: 7.84, width: 1.48, depth: 1.1 } as const;
export const BRAND_SHELF = { x: -4.84, z: 6.61, width: 1.48, depth: .5, height: 1.18, rotationY: 0 } as const;
export const FRONT_VENDING = { x: -1, z: 9.65, rotationY: -Math.PI / 3, halfWidth: .54, halfDepth: .59 } as const;
export type Workstation = { id: string; room: FactoryRoom; x: number; z: number; label: string; halfWidth?: number };
export const INDOOR_STATION_LABELS = ['skee-ball', 'pinball', 'claw machine', 'rhythm cabinet', 'rally cabinet', 'retro terminal', 'classic arcade', 'Candy cabinet', 'Vector cabinet', 'Orbit cabinet', 'Stereo cabinet', 'Twin cabinet'] as const;
export const INDOOR_STATIONS: Workstation[] = INDOOR_ROWS.flatMap((z, row) =>
  INDOOR_COLUMNS.map((x, column) => ({ id: `inside-${row * 6 + column}`, room: 'factory', x, z: z + INTERIOR_Z, label: INDOOR_STATION_LABELS[row * 6 + column] })),
);
export const PATIO_STATIONS: Workstation[] = [
  { id: 'patio-0', room: 'patio', x: 11, z: -1.2, label: 'railing desk' },
  { id: 'patio-1', room: 'patio', x: 16, z: -1.2, label: 'railing desk' },
  { id: 'patio-2', room: 'patio', x: 21, z: -1.2, label: 'railing desk' },
  { id: 'patio-3', room: 'patio', x: 12.3, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-4', room: 'patio', x: 15, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-5', room: 'patio', x: 20, z: 4.5, label: 'solar console' },
];
export const GARAGE_STATIONS: Workstation[] = [
  ...[-3.8, -1.8].map((x, i): Workstation => ({ id: `garage-${i}`, room: 'garage', x, z: GARAGE_WORLD_Z + 12.65, label: 'garage workstation' })),
  ...[-6.3, -2.1, 2.1, 6.3].map((x, i): Workstation => ({ id: `garage-${i+2}`, room: 'garage', x, z: GARAGE_WORLD_Z - 2.75, label: 'window workstation', halfWidth: 1.1 })),
  // Work slots stand .55m in front of their furniture anchor: the portable laptop pose is at z=26.4.
  { id: MINI_WORKSTATION_ID, room: 'garage', x: .95, z: GARAGE_WORLD_Z + 2.4 - .55, label: 'Mini laptop' },
];
// Stable shared slot IDs alternate two indoor stations and one patio station.
export const WORKSTATIONS: Workstation[] = [...PATIO_STATIONS.flatMap((station, i) => [
  ...INDOOR_STATIONS.slice(i * 2, i * 2 + 2), station,
]), ...GARAGE_STATIONS];
export const MINI_WORKSTATION_SLOT = WORKSTATIONS.findIndex(station => station.id === MINI_WORKSTATION_ID);
/** Canonical server coordinates: the lower floor occupies a separate strip of the 2D simulation; 40 units equal one scene metre. */
export function toFactoryWorld(point: { x: number; z: number }): Position {
  return { x: (point.x + 8) * 40, y: (point.z + 4.5) * 40 };
}
export function fromFactoryWorld(point: Position) {
  return { x: point.x / 40 - 8, z: point.y / 40 - 4.5 };
}
export const FACTORY25D_BOUNDS = { minX: -152, maxX: 1272, minY: 8, maxY: 1780 };
export function factory25dWaypoints(from: Position, to: Position): Position[] {
  return routeToStation(fromFactoryWorld(from), fromFactoryWorld(to)).slice(0, -1).map(toFactoryWorld);
}

export type RoomPoint = { x: number; z: number };
type Obstacle = { left: number; right: number; near: number; far: number; id?: string };
export const FACTORY_BODY_RADIUS = 0.22;
const margin = FACTORY_BODY_RADIUS;
export const FACTORY_OBSTACLES: Obstacle[] = [
  ...PATIO_OBSTACLES,
  ...[FACTORY_ELEVATOR,GARAGE_ELEVATOR].map(lift=>({id:'elevator-body',left:lift.x-ELEVATOR_BODY.width/2,right:lift.x+ELEVATOR_BODY.width/2,near:ELEVATOR_BODY.near+(lift===GARAGE_ELEVATOR?GARAGE_WORLD_Z:0),far:ELEVATOR_BODY.far+(lift===GARAGE_ELEVATOR?GARAGE_WORLD_Z:0)})),
  { id: 'dj-booth', left: DJ_BOOTH.x-DJ_BOOTH.width/2, right: DJ_BOOTH.x+DJ_BOOTH.width/2, near: DJ_BOOTH.z-DJ_BOOTH.depth/2, far: DJ_BOOTH.z+DJ_BOOTH.depth/2 },
  { left:BRAND_SHELF.x-BRAND_SHELF.width/2, right:BRAND_SHELF.x+BRAND_SHELF.width/2, near:BRAND_SHELF.z-BRAND_SHELF.depth/2, far:BRAND_SHELF.z+BRAND_SHELF.depth/2 }, // Built-in display joins the shorter front counter.
  ...WORKSTATIONS.filter(station => station.id !== MINI_WORKSTATION_ID).map(station => ({ left: station.x - (station.halfWidth ?? (station.room === 'patio' ? 0.77 : 0.36)), right: station.x + (station.halfWidth ?? (station.room === 'patio' ? 0.77 : 0.36)), near: station.z - 0.3, far: station.z + 0.32 })),
  ...GARAGE_CAR_IDS.map(id => { const bay=GARAGE_CAR_BAYS[id],bounds=GARAGE_PARKED_BOUNDS[id]; return {left:bay.x+bounds.left,right:bay.x+bounds.right,near:GARAGE_WORLD_Z+bay.z+bounds.near,far:GARAGE_WORLD_Z+bay.z+bounds.far}; }),
  { id: 'garage-ramp', left: 9.65, right: 12, near: GARAGE_WORLD_Z - 4.3, far: GARAGE_WORLD_Z + 5.4 }, // Vehicle ramp; pedestrians use the open floor.
  { left: 5.65, right: 11.85, near: GARAGE_WORLD_Z + 11, far: GARAGE_WORLD_Z + 16.1 },
  { left: -11.8, right: -6.2, near: GARAGE_WORLD_Z + 11.7, far: GARAGE_WORLD_Z + 13.2 },
  { left: -8.775, right: -7.525, near: GARAGE_WORLD_Z - 4.1, far: GARAGE_WORLD_Z - 3.6 }, // Preserved plant shelf between the lower lift and window desks.
  { left: 7.88, right: 8.01, near: -4.7, far: -3.25 },
  { left: 7.88, right: 8.01, near: -1.75, far: 14.1 },
  { left: -8.1, right: -7.6, near: 5.46, far: 5.62 },
  { left: -6.2, right: 5.8, near: 5.46, far: 5.62 },
  { left: 7.2, right: 8.1, near: 5.46, far: 5.62 },
  { left: -0.22, right: -0.04, near: 5.6, far: 14.1 },
  { left: FRONT_COUNTER.x-FRONT_COUNTER.width/2, right: FRONT_COUNTER.x+FRONT_COUNTER.width/2, near: FRONT_COUNTER.z-FRONT_COUNTER.depth/2, far: FRONT_COUNTER.z+FRONT_COUNTER.depth/2 },
  { left: FRONT_VENDING.x-FRONT_VENDING.halfWidth, right: FRONT_VENDING.x+FRONT_VENDING.halfWidth, near: FRONT_VENDING.z-FRONT_VENDING.halfDepth, far: FRONT_VENDING.z+FRONT_VENDING.halfDepth }, // Moved down along the front desk room's right divider.
  { left: 0.25, right: 1.1, near: 7.05, far: 8.75 },
  { left: .22, right: 1.34, near: 9.52, far: 10.66 }, // Orange chair; board it from the open right-hand side.
].map(o => {
  const clearance = 'clearance' in o && typeof o.clearance === 'number' ? o.clearance : margin;
  return { ...o, left: o.left - clearance, right: o.right + clearance, near: o.near - clearance, far: o.far + clearance };
});
function inside(p: RoomPoint, o: Obstacle) { return p.x > o.left && p.x < o.right && p.z > o.near && p.z < o.far; }
function floorBounds(point: RoomPoint) {
  return factoryRoomAt(point) === 'garage'
    ? { left: -11.8, right: 11.8, near: 19.7, far: 40 }
    : { left: -7.8, right: 23.8, near: -4.3, far: 13.7 };
}
function outsideFloor(point: RoomPoint) {
  const bounds = floorBounds(point);
  return point.x < bounds.left || point.x > bounds.right || point.z < bounds.near || point.z > bounds.far;
}
function elevatorSegment(a: RoomPoint, b: RoomPoint) {
  return (Math.hypot(a.x-FACTORY_ELEVATOR.x,a.z-FACTORY_ELEVATOR.z)<.001 && Math.hypot(b.x-GARAGE_ELEVATOR.x,b.z-GARAGE_ELEVATOR.z)<.001)
    || (Math.hypot(b.x-FACTORY_ELEVATOR.x,b.z-FACTORY_ELEVATOR.z)<.001 && Math.hypot(a.x-GARAGE_ELEVATOR.x,a.z-GARAGE_ELEVATOR.z)<.001);
}
/** The lift is a transport link, never a diagonal walking aisle. */
export function factoryElevatorTripAt(movement: WorldMovement, timestamp: number) {
  const path=[movement.from,...(movement.waypoints??[]),movement.to].map(fromFactoryWorld);
  const lengths=path.slice(1).map((point,i)=>Math.hypot(point.x-path[i].x,point.z-path[i].z));
  const duration=movement.arrivesAt-movement.startedAt;
  const progress=duration<=0?1:Math.max(0,Math.min(1,(timestamp-movement.startedAt)/duration));
  let distance=lengths.reduce((sum,length)=>sum+length,0)*progress,segment=0;
  while(segment<lengths.length-1&&distance>lengths[segment]) distance-=lengths[segment++];
  const departure=path[segment],arrival=path[segment+1];
  if(!departure||!arrival||!elevatorSegment(departure,arrival)) return;
  return {departure,arrival,progress:lengths[segment]>0?Math.max(0,Math.min(1,distance/lengths[segment])):1};
}
export function clearFactorySegment(a: RoomPoint, b: RoomPoint) {
  if (elevatorSegment(a,b)) return true;
  if (outsideFloor(a) || outsideFloor(b)) return false;
  if ((factoryRoomAt(a)==='garage') !== (factoryRoomAt(b)==='garage')) return false;
  return !FACTORY_OBSTACLES.some(o => {
    let near = 0, far = 1;
    for (const [p, q] of [[a.x-b.x,a.x-o.left],[b.x-a.x,o.right-a.x],[a.z-b.z,a.z-o.near],[b.z-a.z,o.far-a.z]]) {
      if (p === 0) { if (q <= 0) return false; continue; }
      if (p < 0) near = Math.max(near, q/p); else far = Math.min(far, q/p);
      if (near >= far) return false;
    }
    return far > 0 && near < 1;
  });
}
export function factoryMovementIsClear(movement: Pick<WorldMovement, 'from' | 'to' | 'waypoints'>) {
  const points = [movement.from, ...(movement.waypoints ?? []), movement.to].map(fromFactoryWorld);
  return points.slice(1).every((point, index) => clearFactorySegment(points[index], point));
}
const corners: RoomPoint[] = FACTORY_OBSTACLES.flatMap(o => [
  {x:o.left-.015,z:o.near-.015},{x:o.left-.015,z:o.far+.015},
  {x:o.right+.015,z:o.near-.015},{x:o.right+.015,z:o.far+.015},
]).filter(p => (factoryRoomAt(p) === 'garage'
  ? Math.abs(p.x)<11.8 && p.z>19.7 && p.z<40
  : p.x> -7.8 && p.x<23.8 && p.z> -4.3 && p.z<13.7) && !FACTORY_OBSTACLES.some(o => inside(p,o)));
/** A restored pose may predate a new planter or floor edge. Move only invalid poses. */
export function recoverFactoryPosition(position: Position): Position {
  const point = fromFactoryWorld(position);
  const bounds = floorBounds(point);
  const bounded = { x: Math.max(bounds.left, Math.min(bounds.right, point.x)), z: Math.max(bounds.near, Math.min(bounds.far, point.z)) };
  if (!FACTORY_OBSTACLES.some(obstacle => inside(bounded, obstacle))) return outsideFloor(point) ? toFactoryWorld(bounded) : position;
  const sameFloor = corners.filter(corner => (factoryRoomAt(corner)==='garage') === (factoryRoomAt(point)==='garage'));
  if (!sameFloor.length) return position;
  const nearest = sameFloor.reduce((best, corner) =>
    Math.hypot(corner.x - point.x, corner.z - point.z) < Math.hypot(best.x - point.x, best.z - point.z) ? corner : best);
  return toFactoryWorld(nearest);
}
let staticEdges: Array<Array<[number, number]>> | undefined;
/** Visibility routes share the actual wall opening and avoid station/couch footprints. */
export function routeToStation(from: RoomPoint, target: RoomPoint): RoomPoint[] {
  const downstairs = factoryRoomAt(from) === 'garage';
  if (downstairs === (factoryRoomAt(target) === 'garage')) return routeOnFloor(from, target);
  const departure = downstairs ? GARAGE_ELEVATOR : FACTORY_ELEVATOR, arrival = downstairs ? FACTORY_ELEVATOR : GARAGE_ELEVATOR;
  const first = routeOnFloor(from, departure), last = routeOnFloor(arrival, target);
  if (Math.hypot(first.at(-1)!.x-departure.x,first.at(-1)!.z-departure.z)>.001 || Math.hypot(last.at(-1)!.x-target.x,last.at(-1)!.z-target.z)>.001) return [from];
  return [...first, arrival, ...last];
}
function routeOnFloor(from: RoomPoint, target: RoomPoint): RoomPoint[] {
  if (clearFactorySegment(from, target)) return [target];
  staticEdges ??= corners.map((a,i) => corners.flatMap((b,j) => i !== j && clearFactorySegment(a,b) ? [[j,Math.hypot(a.x-b.x,a.z-b.z)] as [number,number]] : []));
  const points = [...corners, from, target], start = points.length-2, end = points.length-1;
  const edges = staticEdges.map(list => [...list]); edges.push([],[]);
  for (const index of [start,end]) for (let j=0;j<index;j++) if (clearFactorySegment(points[index],points[j])) {
    const d = Math.hypot(points[index].x-points[j].x,points[index].z-points[j].z);
    edges[index].push([j,d]); edges[j].push([index,d]);
  }
  const costs = points.map(()=>Infinity), previous = points.map(()=>-1), visited = new Set<number>(); costs[start]=0;
  while(visited.size<points.length) {
    let current=-1; for(let i=0;i<points.length;i++) if(!visited.has(i)&&(current<0||costs[i]<costs[current])) current=i;
    if(current===end||!Number.isFinite(costs[current])) break;
    visited.add(current);
    for(const [next,d] of edges[current]) if(costs[current]+d<costs[next]) {costs[next]=costs[current]+d;previous[next]=current;}
  }
  if(!Number.isFinite(costs[end])) return [from]; // Do not walk through a solid prop when a stale pose is inside it.
  const result: RoomPoint[]=[]; for(let i=end;i!==start&&i>=0;i=previous[i]) result.unshift(points[i]);
  return result;
}
export function constrainFactoryStep(from: Position, to: Position): Position {
  const a=fromFactoryWorld(from), b=fromFactoryWorld(to);
  const downstairs = factoryRoomAt(a) === 'garage';
  if (downstairs) { b.x = Math.max(-11.8, Math.min(11.8,b.x)); b.z = Math.max(19.7,Math.min(40,b.z)); }
  else { b.x = Math.max(-7.8, Math.min(23.8,b.x)); b.z = Math.max(-4.3,Math.min(13.7,b.z)); }
  if(clearFactorySegment(a,b)) return toFactoryWorld(b);
  const horizontal={x:b.x,z:a.z};
  if(clearFactorySegment(a,horizontal)) a.x=b.x;
  const vertical={x:a.x,z:b.z};
  if(clearFactorySegment(a,vertical)) a.z=b.z;
  return toFactoryWorld(a);
}

/** Followers can spread out on open floor, but never straddle a stair wall. */
export function factoryCompanionPosition(parent: RoomPoint, index: number, occupied: RoomPoint[] = []): RoomPoint {
  const siblings:RoomPoint[]=[];
  for(let child=0;child<=index;child++){
    let result:RoomPoint|undefined;
    for(let ring=0;ring<10&&!result;ring++)for(let turn=0;turn<16;turn++){
      const angle=child*2.4+.5+turn*Math.PI/8,radius=.62+ring*.32;
      const candidate={x:parent.x+Math.cos(angle)*radius,z:parent.z+Math.sin(angle)*radius};
      if(clearFactorySegment(parent,candidate)&&siblings.every(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)>=.38)
        &&occupied.every(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)>=.5)){result=candidate;break;}
    }
    siblings.push(result??parent);
  }
  return siblings[index];
}
