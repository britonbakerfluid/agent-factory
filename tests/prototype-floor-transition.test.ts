import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { floorTravelCamera,upperFloorLift,GARAGE_SECTION_X } from '../client/prototypes/factory25dFloorTransition';
import { FACTORY_ELEVATOR,GARAGE_ELEVATOR,GARAGE_LEVEL,toFactoryWorld,constrainFactoryStep,fromFactoryWorld,clearFactorySegment,routeToStation } from '../shared/factory25d-layout';
import { elevatorTrip } from '../client/prototypes/factory25dElevatorTrip';

const home=()=>{const camera=new THREE.OrthographicCamera(-8,8,5.64,-5.64,.1,50);camera.position.set(0,9,14.6);camera.lookAt(0,.35,.45);camera.updateMatrixWorld();return camera;};

describe('physical floor descent',()=>{
  it('starts at the existing factory camera and aligns both elevator shafts',()=>{
    const source=home(),camera=home();floorTravelCamera(camera,source,0,true);
    expect(camera.position.equals(source.position)).toBe(true);
    expect(camera.quaternion.angleTo(source.quaternion)).toBeCloseTo(0);
    expect(camera.zoom).toBe(source.zoom);
    expect(GARAGE_ELEVATOR.x+GARAGE_SECTION_X).toBeCloseTo(FACTORY_ELEVATOR.x);
  });
  it('rebases the settled garage without a visual jump',()=>{
    const camera=home();floorTravelCamera(camera,home(),1,true);
    const before=new THREE.Vector3(GARAGE_ELEVATOR.x+GARAGE_SECTION_X,GARAGE_LEVEL,-2.9).project(camera);
    floorTravelCamera(camera,home(),1,false);
    const after=new THREE.Vector3(GARAGE_ELEVATOR.x,GARAGE_LEVEL,-2.9).project(camera);
    expect(before.distanceTo(after)).toBeLessThan(1e-8);
  });
  it('raises the upper slab beyond the frame before arrival, revealing the garage without a cut',()=>{
    const camera=home();floorTravelCamera(camera,home(),1,true);
    const upperEdge=new THREE.Vector3(0,upperFloorLift(1),13.92).project(camera);
    expect(upperEdge.y).toBeGreaterThan(1);
    const down:number[]=[],up:number[]=[];
    for(let ms=0;ms<=1800;ms+=20){down.push(elevatorTrip(ms,false,true).garage01);up.push(elevatorTrip(ms,true,false).garage01);}
    for(let i=1;i<down.length;i++){expect(down[i]).toBeGreaterThanOrEqual(down[i-1]);expect(up[i]).toBeLessThanOrEqual(up[i-1]);expect(Math.abs(down[i]-down[i-1])).toBeLessThan(.04);}
    expect(upperFloorLift(-1)).toBe(0);expect(upperFloorLift(2)).toBe(11);
  });
});

describe('vending machine walking clearance',()=>{
  it('routes around the front desk cabinet while keeping the lounge and counter aisle open',()=>{
    const from={x:-1,z:8.1},to={x:-1,z:10};
    expect(clearFactorySegment(from,to)).toBe(false);
    const constrained=fromFactoryWorld(constrainFactoryStep(toFactoryWorld(from),toFactoryWorld(to)));
    expect(constrained.z).toBeLessThan(8.41);
    const path=[from,...routeToStation(from,to)];expect(path.at(-1)).toEqual(to);
    for(let i=1;i<path.length;i++)expect(clearFactorySegment(path[i-1],path[i])).toBe(true);
    expect(clearFactorySegment({x:-6.9,z:5.2},{x:-6.9,z:10})).toBe(true);
    expect(clearFactorySegment({x:6.5,z:8.1},{x:6.5,z:10})).toBe(true);
    expect(clearFactorySegment({x:7.2,z:8.1},{x:7.2,z:10})).toBe(true);
    expect(clearFactorySegment({x:-5.15,z:7.4},{x:-5.15,z:8.9})).toBe(true);
  });
});
