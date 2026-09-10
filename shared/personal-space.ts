import type { Position } from './types.js';
import { clearFactorySegment, fromFactoryWorld, recoverFactoryPosition } from './factory25d-layout.js';

/** World units, 40 per metre: shoulder room plus a small comfortable gap. */
export const PERSONAL_SPACE = 24;
export const PERSONAL_SPACE_LOOKAHEAD_MS = 250;
export function distance(a: Position,b: Position) { return Math.hypot(a.x-b.x,a.y-b.y); }
export function segmentDistance(a: Position,b: Position,p: Position) {
  const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
  const t=d ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)) : 0;
  return Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y);
}
/** Swept relative motion catches head-on swaps, perpendicular crossings and fast steps. */
export function peopleCross(a: Position,b: Position,c: Position,d: Position) {
  return segmentDistance({x:a.x-c.x,y:a.y-c.y},{x:b.x-d.x,y:b.y-d.y},{x:0,y:0}) < PERSONAL_SPACE-.01;
}
export function clearPeopleStep(from: Position,to: Position,people: Position[]) {
  return people.every(p=>segmentDistance(from,to,p)>=PERSONAL_SPACE-.01);
}
export function freeStandingPoint(target: Position,people: Position[]): Position {
  const origin=recoverFactoryPosition(target);
  if(people.every(p=>distance(origin,p)>=PERSONAL_SPACE))return origin;
  for(let ring=1;ring<=24;ring++)for(let i=0;i<ring*12;i++){
    const angle=i/(ring*12)*Math.PI*2;
    const point={x:origin.x+Math.cos(angle)*ring*PERSONAL_SPACE,y:origin.y+Math.sin(angle)*ring*PERSONAL_SPACE};
    if(clearFactorySegment(fromFactoryWorld(origin),fromFactoryWorld(point))&&people.every(p=>distance(point,p)>=PERSONAL_SPACE))return point;
  }
  return origin;
}
/** Short local detour around a person; scenery still uses the canonical footprint checks. */
export function passingDetour(from:Position,toward:Position,people:Position[]):Position[]|undefined {
  const blocking=people.filter(p=>segmentDistance(from,toward,p)<PERSONAL_SPACE+2).sort((a,b)=>distance(from,a)-distance(from,b))[0];
  if(!blocking)return;
  const dx=toward.x-from.x,dy=toward.y-from.y,len=Math.hypot(dx,dy);if(len<1)return;
  // Everyone keeps right first. Opposing walkers choose opposite physical sides.
  for(const side of [1,-1])for(const extra of [4,12,24]){
    const r=PERSONAL_SPACE+extra,nx=-dy/len*side,ny=dx/len*side;
    const near={x:blocking.x-dx/len*r+nx*r,y:blocking.y-dy/len*r+ny*r};
    const far={x:blocking.x+dx/len*r+nx*r,y:blocking.y+dy/len*r+ny*r};
    const points=[from,near,far,toward];
    if(points.slice(1).every((p,i)=>clearFactorySegment(fromFactoryWorld(points[i]),fromFactoryWorld(p))&&clearPeopleStep(points[i],p,people)))return [near,far];
  }
}
