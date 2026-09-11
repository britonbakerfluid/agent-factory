import { describe,it,expect } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import { PERSONAL_SPACE, peopleCross,freeStandingPoint,passingDetour,distance } from '../shared/personal-space';
import { toFactoryWorld,factoryMovementIsClear,clearFactorySegment,fromFactoryWorld } from '../shared/factory25d-layout';
import { positionAt,slotPosition } from '../shared/world-layouts';

const p=(x:number,z:number)=>toFactoryWorld({x,z});
const hook=(id:string)=>({hook_event_name:'SessionStart',session_id:id,username:id,cwd:'/fixture',avatar:DEFAULT_AVATAR});
describe('Personal Space update',()=>{
 it('detects swept head-on and crossing collisions, but allows parallel lanes',()=>{
  expect(peopleCross(p(-2,3.5),p(2,3.5),p(2,3.5),p(-2,3.5))).toBe(true);
  expect(peopleCross(p(-2,3.5),p(2,3.5),p(0,2),p(0,5))).toBe(true);
  expect(peopleCross(p(-2,3.5),p(2,3.5),p(-2,4.2),p(2,4.2))).toBe(false);
 });
 it('finds separate standing spots without crossing scenery',()=>{
  const origin=p(3,3.6),occupied=[origin];
  for(let i=0;i<16;i++){
   const next=freeStandingPoint(origin,occupied);
   expect(occupied.every(other=>distance(next,other)>=PERSONAL_SPACE-.001)).toBe(true);
   expect(clearFactorySegment(fromFactoryWorld(origin),fromFactoryWorld(next))).toBe(true);occupied.push(next);
  }
 });
 it('routes around a stationary person on the open floor',()=>{
  const from=p(-2,3.6),to=p(2,3.6),person=p(0,3.6),waypoints=passingDetour(from,to,[person]);
  expect(waypoints).toBeDefined();expect(factoryMovementIsClear({from,to,waypoints})).toBe(true);
 });
 it('assigns simultaneous arrivals distinct positions',()=>{
  const state=new StateManager('factory25d',()=>1000);
  for(let i=0;i<12;i++)state.handleHookEvent(hook('arrival-'+i));
  const points=state.getSnapshot().agents.map(a=>a.world.movement?.from??a.world.position);
  for(let i=0;i<points.length;i++)for(let j=0;j<i;j++)expect(distance(points[i],points[j])).toBeGreaterThanOrEqual(PERSONAL_SPACE-.001);
 });
 it('does not allow manually controlled agents to tunnel through a person',()=>{
  const state=new StateManager('factory25d',()=>1000);state.handleHookEvent(hook('a'));state.handleHookEvent(hook('b'));
  state.get('a')!.world={zone:'manual',facing:'right',position:p(-2,3.6)};
  state.get('b')!.world={zone:'idle',facing:'down',position:p(0,3.6)};
  expect(state.constrainStep(p(-2,3.6),p(2,3.6),'a')).toEqual(p(-2,3.6));
  expect(state.constrainStep(p(-2,4.4),p(2,4.4),'a')).toEqual(p(2,4.4));
 });
 it('keeps head-on walkers apart and lets both reach their destinations',()=>{
  let now=1000;const state=new StateManager('factory25d',()=>now);
  state.handleHookEvent(hook('a'));state.handleHookEvent(hook('b'));
  for(const [id,from,to] of [['a',p(-2,3.6),p(2,3.6)],['b',p(2,3.6),p(-2,3.6)]] as const){
   state.get(id)!.world={zone:'idle',facing:'right',position:from,movement:{from,to,startedAt:now,arrivesAt:now+2000}};
  }
  let previous=[p(-2,3.6),p(2,3.6)];
  for(;now<=15000;now+=50){
   state.advancePersonalSpace(now);
   const [a,b]=['a','b'].map(id=>{const w=state.get(id)!.world;return w.movement?positionAt(w.movement,now):w.position;});
   expect(distance(a,b)).toBeGreaterThanOrEqual(PERSONAL_SPACE-.01);
   expect(distance(previous[0],a)).toBeLessThanOrEqual(4.01);expect(distance(previous[1],b)).toBeLessThanOrEqual(4.01);previous=[a,b];
   for(const id of ['a','b']){const m=state.get(id)!.world.movement;if(m)expect(factoryMovementIsClear(m)).toBe(true);}
  }
  for(const [id,target] of [['a',p(2,3.6)],['b',p(-2,3.6)]] as const){const w=state.get(id)!.world;expect(distance(w.movement?positionAt(w.movement,now):w.position,target)).toBeLessThan(1);}
 });
});

it('keeps a working agent at their station when an idle agent overlaps it',()=>{
 const state=new StateManager('factory25d',()=>1000);state.handleHookEvent(hook('a-idle'));state.handleHookEvent(hook('z-worker'));
 const station=slotPosition('factory25d','work',0);
 state.get('z-worker')!.world={zone:'work',slotIndex:0,facing:'up',position:{...station}};
 state.get('a-idle')!.world={zone:'idle',facing:'down',position:{...station}};
 state.advancePersonalSpace();
 expect(state.get('z-worker')!.world.position).toEqual(station);
 expect(distance(state.get('a-idle')!.world.position,station)).toBeGreaterThanOrEqual(PERSONAL_SPACE-.01);
});

it('repairs a settled worker displaced from their reserved station by an older spacing pass',()=>{
 const state=new StateManager('factory25d',()=>1000);state.handleHookEvent(hook('worker'));
 const station=slotPosition('factory25d','work',0);
 state.get('worker')!.world={zone:'work',slotIndex:0,facing:'up',position:{x:station.x+48,y:station.y+24}};
 state.advancePersonalSpace();expect(state.get('worker')!.world.position).toEqual(station);
});
