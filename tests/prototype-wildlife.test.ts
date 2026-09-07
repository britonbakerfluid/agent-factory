import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ElkVisit, createMeadowElk } from '../client/prototypes/factory25dElk';
import { createValleyBirds } from '../client/prototypes/factory25dBirds';
import { CLEAR_WEATHER } from '../client/sky/weather';
import { meadowHeight, LANDSCAPE_LAKE } from '../client/prototypes/factory25dLandscape';

it('walks the elk in from offscreen, grazes, and walks out before the next visit', () => {
  const visit=new ElkVisit(()=>0); const advance=(s:number)=>{for(let i=0;i<s*10;i++) visit.update(.1);};
  advance(5);expect(visit.visible).toBe(false);advance(2);expect(visit.phase).toBe('walking');
  expect(visit.x).toBeGreaterThan(7.92);
  advance(19);expect(visit.phase).toBe('grazing');expect(visit.x).toBeCloseTo(5.4);
  advance(25);expect(visit.phase).toBe('leaving');advance(20);expect(visit.visible).toBe(false);
  expect(visit.x).toBeGreaterThan(7.92);advance(70);expect(visit.visible).toBe(false);
  const before={...visit};visit.update(100,true);expect({...visit}).toEqual(before);
  for(const z of [-.8,-1.2,-.56,-.96]) for(let x=5.4;x<9.96;x+=.05) {
    expect(LANDSCAPE_LAKE.shoreDistance(x,z)).toBeGreaterThan(1);
    expect(Math.abs(meadowHeight(x+.05,z)-meadowHeight(x,z))/.05).toBeLessThan(1.2);
  }
});

it('grounds the elk on the supplied terrain, freezes hidden visits, and releases GPU resources', () => {
  const random=vi.spyOn(Math,'random').mockReturnValue(0);
  const scene=new THREE.Scene(), heightAt=(x:number,z:number)=>.3+x*.03+z*.02;
  const elk=createMeadowElk(scene,{value:new THREE.Color('#91aec7')},heightAt);random.mockRestore();
  const group=scene.getObjectByName('meadow-elk')!, animals=scene.getObjectByName('elk-pair') as THREE.InstancedMesh;
  for(let i=0;i<320;i++) elk.update(.1,CLEAR_WEATHER,false,false);
  expect(group.visible).toBe(true);expect(animals.count*12).toBeLessThan(900);
  expect(Array.from(animals.instanceMatrix.array).every(Number.isFinite)).toBe(true);
  const color=new THREE.Color(), matrix=new THREE.Matrix4(), bottom=new THREE.Vector3(), hoof=new THREE.Color('#292a21');
  let hooves=0;
  for(let i=0;i<animals.count;i++) {
    animals.getColorAt(i,color);
    if(Math.abs(color.r-hoof.r)+Math.abs(color.g-hoof.g)+Math.abs(color.b-hoof.b)>.00001) continue;
    animals.getMatrixAt(i,matrix);bottom.set(0,-.5,0).applyMatrix4(matrix);
    expect(bottom.y-heightAt(bottom.x,bottom.z)).toBeCloseTo(.001,3);hooves++;
  }
  expect(hooves).toBe(8);
  const before=Array.from(animals.instanceMatrix.array);
  elk.update(100,CLEAR_WEATHER,false,true);expect(Array.from(animals.instanceMatrix.array)).toEqual(before);
  elk.update(.1,CLEAR_WEATHER,true,false);expect(group.visible).toBe(false);
  elk.update(.1,{...CLEAR_WEATHER,rain01:1},false,false);expect(group.visible).toBe(false);
  const dispose=vi.fn();animals.geometry.addEventListener('dispose',dispose);elk.dispose();expect(dispose).toHaveBeenCalledOnce();expect(scene.children).toHaveLength(0);
});

it('adds staggered flocks in one draw, dims with haze, and suppresses flight in storms/night', () => {
  const scene=new THREE.Scene(), haze={value:new THREE.Color('#8caad0')};
  const birds=createValleyBirds(scene,haze), mesh=scene.getObjectByName('valley-birds') as THREE.InstancedMesh;
  expect(mesh.count).toBe(20);expect(mesh.geometry.getAttribute('position').count).toBe(3);
  for(let i=0;i<360;i++) birds.update(.1,CLEAR_WEATHER,false,false);
  expect(mesh.visible).toBe(true);expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
  const positions=Array.from(mesh.instanceMatrix.array);birds.update(100,CLEAR_WEATHER,false,true);
  expect(Array.from(mesh.instanceMatrix.array)).toEqual(positions);
  birds.update(.1,CLEAR_WEATHER,true,false);expect(mesh.visible).toBe(false);
  birds.update(.1,{...CLEAR_WEATHER,rain01:1},false,false);expect(mesh.visible).toBe(false);
  birds.dispose();expect(scene.children).toHaveLength(0);
});
