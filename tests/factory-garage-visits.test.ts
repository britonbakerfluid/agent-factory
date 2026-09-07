import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import { clearFactorySegment, FACTORY_ELEVATOR, GARAGE_ELEVATOR, GARAGE_MINI_LOOKOUTS, fromFactoryWorld, toFactoryWorld, factoryElevatorTripAt } from '../shared/factory25d-layout';
import { positionAt, routeDistance, slotPosition } from '../shared/world-layouts';
import type { WorldMovement } from '../shared/types';

function fixture(username='jonathanvergara') {
  let now=1000;
  const state=new StateManager('factory25d',()=>now);
  const hook={hook_event_name:'SessionStart',session_id:'mini-visitor',username,ownerId:'test-owner',cwd:'/factory',avatar:DEFAULT_AVATAR};
  state.handleHookEvent(hook);
  return {state,hook,agent:()=>state.get(hook.session_id)!,now:()=>now,advance:(time:number)=>{now=time;state.advanceWorld(now);},setTime:(time:number)=>{now=time;}};
}
function firstVisit(f:ReturnType<typeof fixture>) {
  f.advance((f.agent().world.movement?.arrivesAt??f.now())+1);
  f.advance(f.now()+23000);
  expect(f.agent().world.idleVisit).toBe('garage-mini');
  return f.agent().world.movement!;
}
function openRoute(movement:WorldMovement) {
  const points=[movement.from,...(movement.waypoints??[]),movement.to].map(fromFactoryWorld);
  for(let i=1;i<points.length;i++) expect(clearFactorySegment(points[i-1],points[i])).toBe(true);
}

describe('server-authored garage visits',()=>{
  it('walks through the lift to an unobstructed Mini lookout, looks up, then walks home after the dwell',()=>{
    const f=fixture(),movement=firstVisit(f);
    openRoute(movement);
    expect(movement.waypoints).toContainEqual(toFactoryWorld(FACTORY_ELEVATOR));
    expect(movement.waypoints).toContainEqual(toFactoryWorld(GARAGE_ELEVATOR));
    expect(GARAGE_MINI_LOOKOUTS.map(toFactoryWorld)).toContainEqual(movement.to);
    const home=slotPosition('factory25d','idle',f.agent().world.slotIndex!);
    f.advance(movement.arrivesAt+1);
    expect(f.agent().world).toMatchObject({idleVisit:'garage-mini',facing:'up',position:movement.to,movement:undefined});
    f.advance(movement.arrivesAt+11999);
    expect(f.agent().world.movement).toBeUndefined();
    f.advance(f.now()+2);
    expect(f.agent().world.idleVisit).toBeUndefined();
    expect(f.agent().world.movement?.to).toEqual(home);
    openRoute(f.agent().world.movement!);
  });

  it('gives only the exact verified account a frequent cadence; other names use the same rare cadence',()=>{
    const counts=['jonathanvergara','jonathan','jonathanvergara-other','someone-else'].map(username=>{
      const f=fixture(username);let visits=0;
      for(let step=0;step<60;step++) {
        const before=f.agent().world.idleVisit;
        f.advance(Math.max(f.now()+23000,f.agent().world.movement?.arrivesAt??0));
        if(!before&&f.agent().world.idleVisit) visits++;
      }
      return visits;
    });
    expect(counts[0]).toBeGreaterThan(counts[1]*3);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts.slice(1)).toEqual([counts[1],counts[1],counts[1]]);
  });

  it('cancels a visit immediately for work or manual control, including work resuming in the shaft',()=>{
    const f=fixture(),movement=firstVisit(f);
    const waypoints=movement.waypoints!, entry=waypoints.findIndex(p=>p.x===toFactoryWorld(FACTORY_ELEVATOR).x&&p.y===toFactoryWorld(FACTORY_ELEVATOR).y);
    const before=routeDistance(movement.from,waypoints.slice(0,entry),waypoints[entry]);
    const lift=Math.hypot(waypoints[entry+1].x-waypoints[entry].x,waypoints[entry+1].y-waypoints[entry].y);
    const total=routeDistance(movement.from,waypoints,movement.to);
    f.setTime(movement.startedAt+(movement.arrivesAt-movement.startedAt)*(before+lift*.6)/total);
    expect(factoryElevatorTripAt(movement,f.now())?.progress).toBeCloseTo(.6);
    f.state.handleHookEvent({...f.hook,hook_event_name:'PreToolUse',tool_name:'Read'});
    expect(f.agent().world.zone).toBe('work');
    expect(f.agent().world.idleVisit).toBeUndefined();
    openRoute(f.agent().world.movement!);
    for(let i=0;i<4;i++) f.advance(f.now()+60000);
    expect(f.agent().world.idleVisit).toBeUndefined();
    const manual=fixture(),trip=firstVisit(manual);
    manual.advance(trip.arrivesAt+1);
    manual.state.setManualControl(manual.hook.session_id,{...trip.to,facing:'left',moving:false});
    expect(manual.agent().world.idleVisit).toBeUndefined();
    const controlled={...manual.agent().manualControl};
    manual.advance(manual.now()+90000);
    expect(manual.agent().manualControl).toEqual(controlled);
    expect(manual.agent().world.idleVisit).toBeUndefined();
    const inLift=fixture(),ride=firstVisit(inLift);
    const liftEntry=ride.waypoints!.findIndex(p=>p.x===toFactoryWorld(FACTORY_ELEVATOR).x&&p.y===toFactoryWorld(FACTORY_ELEVATOR).y);
    const prefix=routeDistance(ride.from,ride.waypoints!.slice(0,liftEntry),ride.waypoints![liftEntry]);
    const shaftLength=Math.hypot(toFactoryWorld(GARAGE_ELEVATOR).x-toFactoryWorld(FACTORY_ELEVATOR).x,toFactoryWorld(GARAGE_ELEVATOR).y-toFactoryWorld(FACTORY_ELEVATOR).y);
    inLift.setTime(ride.startedAt+(ride.arrivesAt-ride.startedAt)*(prefix+shaftLength*.6)/routeDistance(ride.from,ride.waypoints!,ride.to));
    inLift.state.setManualControl(inLift.hook.session_id,{...positionAt(ride,inLift.now()),facing:'left',moving:false});
    expect(inLift.agent().manualControl).toMatchObject(toFactoryWorld(GARAGE_ELEVATOR));
    expect(inLift.agent().world.idleVisit).toBeUndefined();
  });

  it('reserves separated inspection spots so concurrent visitors do not overlap',()=>{
    const f=fixture();
    for(let i=0;i<4;i++) f.state.handleHookEvent({...f.hook,session_id:`regular-${i}`});
    f.advance(100000);f.advance(123000);
    const visitors=f.state.getAll().filter(agent=>agent.world.idleVisit);
    expect(visitors.length).toBe(2);
    expect(visitors.filter(agent=>agent.world.carVisit?.car==='mini')).toHaveLength(1);
    const targets=visitors.map(agent=>agent.world.movement?.to??agent.world.position);
    expect(Math.hypot(targets[0].x-targets[1].x,targets[0].y-targets[1].y)).toBeGreaterThan(48);
    visitors.forEach(agent=>openRoute(agent.world.movement!));
  });
});
