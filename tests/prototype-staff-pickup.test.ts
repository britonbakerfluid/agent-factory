import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {DEFAULT_AVATAR} from '../shared/constants';
import {createStaffPickup,createPickupMotion,updatePickupShadow,createPickupFold,pickupReleaseLanding} from '../client/prototypes/factory25dPickup';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){
 let now=100;vi.spyOn(performance,'now').mockImplementation(()=>now);
 vi.stubGlobal('matchMedia',()=>({matches:true}));vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('document',{documentElement:{classList:{add:vi.fn(),remove:vi.fn()}}});
 const button=Object.assign(new EventTarget(),{setPointerCapture:vi.fn()});
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})};
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.Texture()}));new THREE.Scene().add(mesh);
 const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.z=10;camera.updateMatrixWorld();
 const pickup=createStaffPickup(mesh,button as unknown as HTMLButtonElement,canvas as HTMLCanvasElement,DEFAULT_AVATAR);
 const event=(type:string,x=200,y=200)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,button:0,clientX:x,clientY:y});button.dispatchEvent(e);return e;};
 const frame=(time:number)=>{now=time;mesh.position.set(0,0,0);pickup.update(camera);};frame(now);
 return {mesh,pickup,event,frame,button};
}
describe('room staff pickup',()=>{
 it('keeps a tap available for the normal staff action',()=>{
  const f=fixture(),click=vi.fn();f.button.addEventListener('click',click);f.event('pointerdown');f.event('pointerup');f.event('click');expect(click).toHaveBeenCalledOnce();expect(f.pickup.busy).toBe(false);f.pickup.dispose();
 });
 it('lifts after a drag, suppresses its click, and returns exactly to the post',()=>{
  const f=fixture(),click=vi.fn();f.button.addEventListener('click',click);f.event('pointerdown');f.event('pointermove',260,100);f.frame(200);
  expect(f.pickup.held).toBe(true);expect(f.mesh.position.y).toBeGreaterThan(0);expect(f.mesh.children[0].visible).toBe(true);
  f.event('pointerup',260,100);f.event('click');expect(click).not.toHaveBeenCalled();for(let t=220;t<=3200;t+=20)f.frame(t);
  expect(f.mesh.position.length()).toBeCloseTo(0,8);expect(f.pickup.busy).toBe(false);expect(f.mesh.children[0].visible).toBe(false);f.pickup.dispose();
 });
 it('returns safely after pointer cancellation',()=>{
  const f=fixture();f.event('pointerdown');f.event('pointermove',250,100);f.frame(200);f.event('pointercancel');for(let t=220;t<=3200;t+=20)f.frame(t);expect(f.pickup.busy).toBe(false);expect(f.mesh.position.length()).toBeCloseTo(0,8);f.pickup.dispose();
 });
});

describe('pull before lift',()=>{
 it('keeps the feet planted during a small upward or sideways pull, then lifts after the fabric is taut',()=>{
  const f=fixture(),canvas={getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})} as HTMLCanvasElement;
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.z=10;camera.updateMatrixWorld();
  const motion=createPickupMotion(f.mesh,DEFAULT_AVATAR);
  for(let t=120;t<=400;t+=20){f.frame(t);motion.update(camera,canvas,{x:200,y:180});}
  expect(motion.stage).toBe('pulling');expect(motion.shadowAirborne).toBe(false);expect(f.mesh.position.y).toBe(0);
  for(let t=420;t<=600;t+=20){f.frame(t);motion.update(camera,canvas,{x:240,y:180});}
  expect(motion.stage).toBe('pulling');expect(f.mesh.position.x).toBe(0);expect(f.mesh.rotation.z).toBe(0);
  for(let t=620;t<=1000;t+=20){f.frame(t);motion.update(camera,canvas,{x:240,y:80});}
  expect(motion.stage).toBe('lifted');expect(motion.shadowAirborne).toBe(true);expect(f.mesh.position.y).toBeGreaterThan(.2);
  for(let t=1020;t<=1800;t+=20){f.frame(t);motion.update(camera,canvas,{x:240,y:190});}
  expect(motion.stage).toBe('lifted');expect(f.mesh.position.y).toBeLessThan(0);
  expect(f.mesh.material.depthTest).toBe(false);expect(f.mesh.material.transparent).toBe(true);expect(f.mesh.renderOrder).toBe(1000);
  f.frame(1820);motion.update(camera,canvas);expect(motion.stage).not.toBe('lifted');expect(f.mesh.material.depthTest).toBe(true);expect(f.mesh.material.transparent).toBe(false);
  motion.dispose();f.pickup.dispose();
 });
});

it('preserves the grabbed facing while the feet remain planted',()=>{
 const f=fixture(),texture=f.mesh.material.map!;
 texture.offset.set(.25,.5);f.event('pointerdown');f.event('pointermove',200,180);
 texture.offset.set(0,0);f.frame(140);
 expect(texture.offset.toArray()).toEqual([.25,.5]);expect(f.pickup.airborne).toBe(false);
 f.pickup.dispose();
});

it('follows the dangling feet independently of the mouse, then freezes the drop spot',()=>{
 const scene=new THREE.Scene(),mesh=new THREE.Mesh(),shadow=new THREE.Mesh();scene.add(mesh,shadow);shadow.scale.set(.4,.3,1);
 const camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(0,8,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 mesh.position.set(0,1,2);updatePickupShadow(mesh,shadow,camera,true);const first=shadow.position.clone();
 mesh.userData.pickupPointer={x:500,y:0};updatePickupShadow(mesh,shadow,camera,true);
 expect(shadow.position.distanceTo(first)).toBeLessThan(1e-8);
 mesh.position.set(2,2,2);updatePickupShadow(mesh,shadow,camera,true);
 expect(shadow.position.x).not.toBeCloseTo(first.x);expect(shadow.position.z).not.toBeCloseTo(first.z);
 const landing=shadow.position.clone();mesh.userData.pickupFalling=true;mesh.position.y=1;updatePickupShadow(mesh,shadow,camera,true);
 expect(shadow.position.toArray()).toEqual(landing.toArray());expect(shadow.scale.toArray()).toEqual([.4,.3,1]);
 mesh.userData.pickupFalling=false;mesh.position.set(0,5,0);updatePickupShadow(mesh,shadow,camera,true);
 expect(shadow.position.z).toBeCloseTo(-4.3);
});

it('draws the stretched shirt behind the lifted body and the grip in front',()=>{
 const mesh=new THREE.Mesh(),fold=createPickupFold(mesh,DEFAULT_AVATAR);mesh.renderOrder=1000;
 expect(mesh.children[0].renderOrder).toBeLessThan(mesh.renderOrder);
 expect(mesh.children[1].renderOrder).toBeGreaterThan(mesh.renderOrder);
 fold.dispose();
});

it('leaves normal floor placement unchanged during a grounded tug',()=>{
 const mesh=new THREE.Mesh(),shadow=new THREE.Mesh(),camera=new THREE.PerspectiveCamera();
 shadow.position.set(2,.004,3);shadow.scale.set(.4,.3,1);mesh.position.set(2,.4,3);
 updatePickupShadow(mesh,shadow,camera,false);
 expect(shadow.position.toArray()).toEqual([2,.004,3]);expect(shadow.scale.toArray()).toEqual([.4,.3,1]);
});

it('carries release momentum toward the throw and keeps a still release in place',()=>{
 const mesh=new THREE.Mesh();mesh.userData.pickupLanding={x:0,z:2};
 mesh.userData.pickupVelocity={x:0,y:0};expect(pickupReleaseLanding(mesh)).toEqual({x:0,z:2});
 mesh.userData.pickupVelocity={x:4,y:3};expect(pickupReleaseLanding(mesh).x).toBeGreaterThan(.5);
 mesh.userData.pickupVelocity={x:-4,y:3};expect(pickupReleaseLanding(mesh).x).toBeLessThan(-.5);
});

it('continues upward and sideways after release before gravity brings the agent down',()=>{
 const f=fixture(),canvas={getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})} as HTMLCanvasElement;
 const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.z=10;camera.updateMatrixWorld();
 const motion=createPickupMotion(f.mesh,DEFAULT_AVATAR);
 for(let t=120;t<=320;t+=20){f.frame(t);motion.update(camera,canvas,{x:200+(t-120)*.4,y:150-(t-120)*.5});}
 const before=f.mesh.position.clone();expect(f.mesh.userData.pickupVelocity.x).toBeGreaterThan(0);expect(f.mesh.userData.pickupVelocity.y).toBeGreaterThan(0);
 f.frame(340);motion.update(camera,canvas);
 expect(f.mesh.position.x).toBeGreaterThan(before.x);expect(f.mesh.position.y).toBeGreaterThan(before.y);
 motion.dispose();f.pickup.dispose();
});

it('gains altitude only after lifting, and starts each new pickup low again',()=>{
 const f=fixture(),canvas={getBoundingClientRect:()=>({left:0,top:0,width:400,height:400})} as HTMLCanvasElement;
 const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.z=10;camera.updateMatrixWorld();
 const motion=createPickupMotion(f.mesh,DEFAULT_AVATAR);
 for(let t=120;t<=1000;t+=20){f.frame(t);motion.update(camera,canvas,{x:200,y:180});}
 expect(f.mesh.userData.pickupHeight).toBe(.18);
 for(let t=1020;t<=1300;t+=20){f.frame(t);motion.update(camera,canvas,{x:200,y:70});}
 const initial=f.mesh.userData.pickupHeight;
 for(let t=1320;t<=6300;t+=20){f.frame(t);motion.update(camera,canvas,{x:200,y:70});}
 expect(f.mesh.userData.pickupHeight).toBeGreaterThan(initial+1);
 expect(f.mesh.userData.pickupHeight).toBeLessThan(2.18);
 for(let t=6320;t<=8300;t+=20){f.frame(t);motion.update(camera,canvas);}
 f.frame(8320);motion.update(camera,canvas,{x:200,y:180});expect(f.mesh.userData.pickupHeight).toBe(.18);
 motion.dispose();f.pickup.dispose();
});
