import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GarageDrivingSimulation, GARAGE_HOVER_HEIGHT, GARAGE_FIRE_LIFETIME_MS } from '../shared/factory25d-driving';
import { GARAGE_CAR_BAYS, GARAGE_CAR_YAW, GARAGE_RAMP, garageRampHeightAt } from '../shared/factory25d-garage';
import { GarageDriveInterpolation } from '../client/prototypes/factory25dDriveInterpolation';
import { createGarageTimeJump } from '../client/prototypes/factory25dGarageTimeJump';

function run(sim: GarageDrivingSimulation, seconds: number, start=1000) {
  for(let i=1;i<=Math.ceil(seconds*120);i++) sim.step(1/120,start+i*1000/120);
}
function exit() {
  const sim=new GarageDrivingSimulation();sim.claim('delorean','pilot');
  const car=sim.car('delorean');Object.assign(car,{x:10.77,z:6.8,yaw:Math.PI,hoverHeight:GARAGE_HOVER_HEIGHT});
  sim.setInput('delorean',{throttle:1,steer:0,drift:false});
  let now=1000;
  while(!car.timeJump && now<6000){sim.step(1/120,now);now+=1000/120;expect(car.damage).toBe(0);}
  expect(car.timeJump).toBeDefined();return {sim,car,now};
}

describe('DeLorean hover and time-jump exit',()=>{
  it('retains sideways momentum, with even freer sliding while holding drift',()=>{
    const coast=(id:'mini'|'delorean',drift=false)=>{
      const sim=new GarageDrivingSimulation();sim.claim(id,'pilot');const car=sim.car(id);
      Object.assign(car,{x:-2,z:7,yaw:0,vx:3,vz:1,hoverHeight:id==='delorean'?GARAGE_HOVER_HEIGHT:0});
      sim.setInput(id,{throttle:0,steer:0,drift});run(sim,.6);expect(car.damage).toBe(0);return car.vx;
    };
    expect(coast('mini')).toBeLessThan(.1);
    expect(coast('delorean')).toBeGreaterThan(1.9);
    expect(coast('delorean',true)).toBeGreaterThan(coast('delorean')+.4);
  });

  it('flies across the parked row without damaging cars, while walls and low-altitude collisions remain solid',()=>{
    const sim=new GarageDrivingSimulation();sim.claim('delorean','pilot');const car=sim.car('delorean');
    Object.assign(car,{x:9.2,z:.25,yaw:-Math.PI/2,vx:-6,hoverHeight:GARAGE_HOVER_HEIGHT});
    run(sim,3);expect(car.x).toBeLessThan(-7);expect(sim.cars.every(c=>c.damage===0)).toBe(true);
    const mini=sim.car('mini');expect(sim.isClear({...car,x:mini.x,z:mini.z,hoverHeight:0})).toBe(false);
    Object.assign(car,{x:10.2,z:7,yaw:Math.PI/2,vx:6,vz:0});run(sim,.4,5000);
    expect(car.x).toBeLessThan(11);expect(car.damage).toBeGreaterThan(0);
  });

  it('keeps the ramp closed to grounded cars and the doorway narrow for flying cars',()=>{
    const sim=new GarageDrivingSimulation();
    expect(sim.isClear({...sim.car('mini'),x:10.77,z:3,yaw:Math.PI})).toBe(false);
    const flying={...sim.car('delorean'),x:10.77,z:3,yaw:Math.PI,hoverHeight:GARAGE_HOVER_HEIGHT};
    expect(sim.isClear(flying)).toBe(true);
    expect(sim.isClear({...flying,z:-4.3})).toBe(true);
    expect(sim.isClear({...flying,x:9.7,z:-4.3})).toBe(false);
    expect(sim.isClear({...flying,z:-6})).toBe(false);
  });

  it('exits once, returns to its own bay on the shared clock, leaves two separate grounded fire trails and preserves damage',()=>{
    const {sim,car,now}=exit();const jump={...car.timeJump!};car.damage=.4;
    expect(car.z).toBeLessThan(GARAGE_RAMP.doorZ);expect(car.mode).toBe('returning');
    expect(car.timeJump!.arrived).toBe(false);expect(sim.marks).toHaveLength(20);
    expect(sim.claim('delorean','pilot')).toBe(false);expect(sim.reset('delorean')).toBe(false);
    run(sim,.2,now);expect(car.timeJump!.arrived).toBe(false);
    const snapshot=sim.snapshot(now);run(sim,.5,now+.2*1000);
    expect(car.timeJump).toMatchObject({id:jump.id,arrived:true});expect(snapshot.cars.find(c=>c.id==='delorean')!.timeJump!.arrived).toBe(false);
    expect(car).toMatchObject({...GARAGE_CAR_BAYS.delorean,yaw:GARAGE_CAR_YAW,damage:.4});
    expect(sim.marks).toHaveLength(40);
    for(const mark of sim.marks){expect(mark.kind).toBe('fire');expect(Math.hypot(mark.x2-mark.x1,mark.z2-mark.z1)).toBeCloseTo(.32);expect(mark.y1).toBe(garageRampHeightAt(mark.x1,mark.z1));}
    expect(sim.marks.slice(0,20).every(m=>(m.y1??0)>.7)).toBe(true);
    expect(sim.marks.slice(20).every(m=>m.y1===0)).toBe(true);
    run(sim,2,now+700);expect(car.mode).toBe('parked');expect(car.damage).toBe(.4);
  });

  it('waits above an occupied bay and completes the arrival even if the pilot disconnects',()=>{
    const {sim,car,now}=exit();Object.assign(sim.car('mini'),GARAGE_CAR_BAYS.delorean);sim.release('delorean');
    run(sim,3,now);expect(car.mode).toBe('returning');expect(car.hoverHeight).toBe(GARAGE_HOVER_HEIGHT);
    Object.assign(sim.car('mini'),GARAGE_CAR_BAYS.mini);run(sim,2,now+3000);
    expect(car.mode).toBe('parked');expect(car.hoverHeight).toBe(0);
  });

  it('does not interpolate a return through the room or replay an expired flash on reconnect',()=>{
    const {sim,car,now}=exit(), out={...car};run(sim,.7,now);
    const poses=new GarageDriveInterpolation();poses.push([out],1000,0);poses.push([{...car}],1100,100);
    expect(poses.sample(150)[0].x).toBe(GARAGE_CAR_BAYS.delorean.x);
    const room=new THREE.Group(), effects=createGarageTimeJump(room);
    effects.replaceMarks(sim.marks);effects.pose(car.timeJump);effects.update(now+800,true,false);
    const flames=room.getObjectByName('delorean-fire-trails') as THREE.InstancedMesh;
    expect(flames.visible).toBe(true);expect(flames.count).toBe(80);
    effects.update(now+800,false,false);expect(flames.visible).toBe(false);
    effects.update(car.timeJump!.arriveAt+40,true,true);expect(room.getObjectByName('delorean-arrival-flash')!.visible).toBe(false);
    effects.update(now+GARAGE_FIRE_LIFETIME_MS+2000,true,false);expect(flames.visible).toBe(false);
    effects.replaceMarks(sim.marks);effects.pose(car.timeJump);effects.update(now+GARAGE_FIRE_LIFETIME_MS+2100,true,false);
    expect(flames.count).toBe(0);expect(room.getObjectByName('delorean-arrival-flash')!.visible).toBe(false);
    effects.dispose();expect(room.children).toHaveLength(0);
  });
});
