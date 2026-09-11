import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { floorTravelCamera,upperFloorLift,createFloorSection,GARAGE_SECTION_X,GARAGE_SECTION_Y } from '../client/prototypes/factory25dFloorTransition';
import { FACTORY_ELEVATOR,GARAGE_ELEVATOR,GARAGE_LEVEL,FRONT_VENDING,toFactoryWorld,constrainFactoryStep,fromFactoryWorld,clearFactorySegment,routeToStation } from '../shared/factory25d-layout';
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
    const camera=home();floorTravelCamera(camera,home(),1,true,false);
    const before=new THREE.Vector3(GARAGE_ELEVATOR.x+GARAGE_SECTION_X,GARAGE_LEVEL+GARAGE_SECTION_Y,-2.9).project(camera);
    floorTravelCamera(camera,home(),1,false);
    const after=new THREE.Vector3(GARAGE_ELEVATOR.x,GARAGE_LEVEL,-2.9).project(camera);
    expect(before.distanceTo(after)).toBeLessThan(1e-8);
  });
  it('provides slab undersides for the passing eye-level view',()=>{
    const section=createFloorSection(new THREE.Scene());
    expect(section.root.position.toArray()).toEqual([0,0,0]);
    expect(section.root.scale.toArray()).toEqual([1,1,1]);
    expect(section.root.getObjectByName('upper-slab-underside')).toBeDefined();
    expect(section.root.getObjectByName('patio-lower-underside')).toBeDefined();
    section.dispose();
  });
  it('clears the upper cutaway above the frame before the garage settles',()=>{
    const camera=home();floorTravelCamera(camera,home(),1,true);
    const section=createFloorSection(new THREE.Scene());section.root.position.y=upperFloorLift(1);section.root.updateMatrixWorld(true);
    section.root.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;
      const bounds=new THREE.Box3().setFromObject(node);
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
        expect(new THREE.Vector3(x,y,z).project(camera).y,node.name).toBeGreaterThan(1.04);
      }
    });
    section.dispose();
  });
  it('keeps projected room motion continuous while lowering and restoring the view',()=>{
    const camera=home(),source=home();
    const landmarks=[
      {at:new THREE.Vector3(0,0,13.9),upper:true},
      {at:new THREE.Vector3(0,2.5,-4.6),upper:true},
      {at:new THREE.Vector3(12,-1,8.2),upper:true},
      {at:new THREE.Vector3(GARAGE_SECTION_X,GARAGE_LEVEL+GARAGE_SECTION_Y,16.2),upper:false},
      {at:new THREE.Vector3(GARAGE_SECTION_X,GARAGE_LEVEL+GARAGE_SECTION_Y,-4.6),upper:false},
    ];
    let previous:number[]|undefined;
    for(let ms=0;ms<=2400;ms+=16){
      const t=elevatorTrip(ms,false,true).garage01;
      floorTravelCamera(camera,source,t,true);
      const ys=landmarks.map(({at,upper})=>{
        floorTravelCamera(camera,source,t,true,upper);
        return at.clone().add(new THREE.Vector3(0,upper?upperFloorLift(t):0,0)).project(camera).y;
      });
      if(previous)ys.forEach((y,i)=>{
        expect(Number.isFinite(y)).toBe(true);
        // Bound visible movement; offscreen slabs can cross larger distances.
        if(Math.abs(y)<=1||Math.abs(previous![i])<=1)expect(Math.abs(y-previous![i])).toBeLessThan(.14);
      });
      previous=ys;
    }
    expect(upperFloorLift(-1)).toBe(0);expect(upperFloorLift(2)).toBe(upperFloorLift(1));
  });
  it('keeps the camera path continuous in both directions and preserves passenger timing',()=>{
    const source=home(),camera=home(),previous=home();
    for(let i=0;i<=1000;i++){
      floorTravelCamera(camera,source,i/1000,true);
      expect(camera.position.distanceTo(previous.position)).toBeLessThan(.11);
      expect(camera.quaternion.angleTo(previous.quaternion)).toBeLessThan(.012);
      previous.copy(camera);
    }
    const down:number[]=[],up:number[]=[];
    for(let ms=0;ms<=2400;ms+=20){down.push(elevatorTrip(ms,false,true).garage01);up.push(elevatorTrip(ms,true,false).garage01);}
    for(let i=1;i<down.length;i++){expect(down[i]).toBeGreaterThanOrEqual(down[i-1]);expect(up[i]).toBeLessThanOrEqual(up[i-1]);expect(Math.abs(down[i]-down[i-1])).toBeLessThan(.04);}
    expect(down.at(-1)).toBe(1);expect(up.at(-1)).toBe(0);
    expect(elevatorTrip(1770,false,true,false,true).done).toBe(true);
    expect(elevatorTrip(1770,false,true).done).toBe(false);
    expect(elevatorTrip(240,false,true,true).done).toBe(true);
    floorTravelCamera(camera,source,-1,true);expect(camera.position.equals(source.position)).toBe(true);
    floorTravelCamera(camera,source,2,true);expect(camera.position.y).toBeCloseTo(GARAGE_LEVEL+GARAGE_SECTION_Y+18.94);
  });
  it('never magnifies nearby objects or overshoots either room zoom',()=>{
    const camera=home(),source=home(),identity=new THREE.Matrix4();
    const projectedWidth=(depth:number)=>{
      const left=new THREE.Vector3(-1,0,-depth).applyMatrix4(camera.matrixWorld).project(camera);
      const right=new THREE.Vector3(1,0,-depth).applyMatrix4(camera.matrixWorld).project(camera);
      return right.x-left.x;
    };
    floorTravelCamera(camera,source,0,true);
    expect(camera.projectionMatrix.equals(source.projectionMatrix)).toBe(true);
    expect(projectedWidth(10)).toBeCloseTo(projectedWidth(20));
    let previousWidth=projectedWidth(10);
    for(let i=0;i<=100;i++){
      floorTravelCamera(camera,source,i/100,true);
      expect(projectedWidth(10)).toBeCloseTo(projectedWidth(20));
      expect(projectedWidth(10)).toBeLessThanOrEqual(previousWidth+1e-8);
      expect(camera.zoom).toBeGreaterThanOrEqual(.66);expect(camera.zoom).toBeLessThanOrEqual(source.zoom);
      previousWidth=projectedWidth(10);
      const product=camera.projectionMatrix.clone().multiply(camera.projectionMatrixInverse);
      product.elements.forEach((value,index)=>expect(value).toBeCloseTo(identity.elements[index],8));
    }
    const settled=home();floorTravelCamera(settled,source,1,false);
    floorTravelCamera(camera,source,1,true,false);
    expect(camera.projectionMatrix.equals(settled.projectionMatrix)).toBe(true);
  });
});

describe('vending machine walking clearance',()=>{
  it('routes around the front desk cabinet while keeping the lounge and counter aisle open',()=>{
    // Keep both endpoints outside the relocated machine's footprint.
    const from={x:FRONT_VENDING.x,z:FRONT_VENDING.z-FRONT_VENDING.halfDepth-.6};
    const to={x:FRONT_VENDING.x,z:FRONT_VENDING.z+FRONT_VENDING.halfDepth+.6};
    expect(clearFactorySegment(from,to)).toBe(false);
    const constrained=fromFactoryWorld(constrainFactoryStep(toFactoryWorld(from),toFactoryWorld(to)));
    expect(constrained.z).toBeLessThan(FRONT_VENDING.z-FRONT_VENDING.halfDepth);
    const path=[from,...routeToStation(from,to)];expect(path.at(-1)).toEqual(to);
    for(let i=1;i<path.length;i++)expect(clearFactorySegment(path[i-1],path[i])).toBe(true);
    // The front-counter entrance stays clear; farther down, pedestrians now
    // route around the physical brand shelf (covered by prototype-factory-paths).
    expect(clearFactorySegment({x:-6.9,z:5.2},{x:-6.9,z:7.35})).toBe(true);
    expect(clearFactorySegment({x:6.5,z:8.1},{x:6.5,z:10})).toBe(true);
    expect(clearFactorySegment({x:7.2,z:8.1},{x:7.2,z:10})).toBe(true);
    expect(clearFactorySegment({x:-5.15,z:7.4},{x:-5.15,z:8.9})).toBe(true);
  });
});

it('reveals the arriving upper floor from below, through eye level, then from above',()=>{
  const source=home(),camera=home();
  const directionAt=(t:number)=>{floorTravelCamera(camera,source,t,true);return camera.getWorldDirection(new THREE.Vector3()).y;};
  expect(directionAt(.70)).toBeGreaterThan(0);
  expect(Math.abs(directionAt(.65))).toBeLessThan(.025);
  expect(directionAt(.3)).toBeLessThan(-.25);
  expect(directionAt(0)).toBeCloseTo(source.getWorldDirection(new THREE.Vector3()).y);
  // Reversing travel retraces the same spatial path, rather than adding a bob.
  let previous=directionAt(.70);
  for(let i=69;i>=0;i--) {
    const direction=directionAt(i/100);
    expect(direction).toBeLessThanOrEqual(previous+1e-8);
    previous=direction;
  }
});

it('keeps the lower floor elevated while the upper floor passes eye level',()=>{
  const source=home(),upper=home(),lower=home();
  for(let i=0;i<=100;i++) {
    floorTravelCamera(lower,source,i/100,true,false);
    expect(lower.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(-.5);
  }
  floorTravelCamera(upper,source,.65,true);
  expect(Math.abs(upper.getWorldDirection(new THREE.Vector3()).y)).toBeLessThan(.025);
  floorTravelCamera(lower,source,1,true,false);
  floorTravelCamera(upper,source,1,true);
  expect(lower.position.distanceTo(upper.position)).toBeLessThan(1e-8);
  expect(lower.quaternion.angleTo(upper.quaternion)).toBeLessThan(1e-8);
});

it('looks further down at the garage as we rise and less steeply as we descend',()=>{
  const source=home(),camera=home();
  let previous=-1;
  for(let i=0;i<=100;i++) {
    floorTravelCamera(camera,source,i/100,true,false);
    const y=camera.getWorldDirection(new THREE.Vector3()).y;
    expect(y).toBeGreaterThanOrEqual(previous-1e-8);
    previous=y;
  }
});

it('holds each floor at its own settled zoom throughout travel',()=>{
  const source=home(),camera=home();
  for(let i=0;i<=100;i++) {
    floorTravelCamera(camera,source,i/100,true,true);
    expect(camera.zoom).toBe(i < 100 ? source.zoom : .66);
    floorTravelCamera(camera,source,i/100,true,false);
    expect(camera.zoom).toBe(.66);
  }
});

it('keeps the garage framing identical during the landing hold and final rebase',()=>{
  const source=home(),camera=home();
  const point=new THREE.Vector3(GARAGE_ELEVATOR.x,GARAGE_LEVEL,0);
  let landed:THREE.Vector3|undefined;
  for(const elapsed of [1650,1800,2100,2390,2400]) {
    const trip=elevatorTrip(elapsed,false,true);
    expect(trip.garage01).toBe(1);
    const physical=!trip.done;
    floorTravelCamera(camera,source,trip.garage01,physical);
    const projected=point.clone().add(new THREE.Vector3(physical?GARAGE_SECTION_X:0,physical?GARAGE_SECTION_Y:0,0)).project(camera);
    expect(camera.zoom).toBe(.66);
    if(landed)expect(projected.distanceTo(landed)).toBeLessThan(1e-8);
    landed=projected;
  }
});

it('preserves the factory zoom before and after reduced-motion trips',()=>{
 const source=home(),camera=home();
 for(const toGarage of [false,true])for(const elapsed of [0,50,109,110,180,240]) {
  const trip=elevatorTrip(elapsed,!toGarage,toGarage,true);
  floorTravelCamera(camera,source,trip.garage01,false);
  expect(camera.zoom).toBe(trip.garage?.66:source.zoom);
 }
});
