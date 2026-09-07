import {describe,it,expect} from 'vitest';
import {createRoadGround} from '../client/prototypes/factory25dRoadGround';
import {ROAD_HALF,WORLD_SCALE} from '../client/prototypes/factory25dMotorTrack';

describe('mountain road grading',()=>{
  const natural=(x:number,z:number)=>.3*Math.sin(x*1.3)+.6*Math.cos(z*.8);
  it('supports the center and both shoulders continuously on uneven ground',()=>{
    const ground=createRoadGround(natural);
    for(const s of ground.track.samples)for(const side of [-1,0,1]){
      const x=(s.p.x+s.right.x*side*(ROAD_HALF+.6))/WORLD_SCALE;
      const z=(s.p.z+s.right.z*side*(ROAD_HALF+.6))/WORLD_SCALE;
      expect(Math.abs(ground.heightAt(x,z)-(s.p.y/WORLD_SCALE-.003))).toBeLessThan(.006);
    }
  });
  it('preserves land outside the corridor and blends without a shoulder step',()=>{
    const ground=createRoadGround(natural);
    expect(ground.heightAt(10,6)).toBe(natural(10,6));
    for(const s of ground.track.samples.filter((_,i)=>i%40===0)) {
      let previous=ground.heightAt(s.p.x/WORLD_SCALE,s.p.z/WORLD_SCALE);
      for(let offset=.01;offset<1.5;offset+=.01){
        const y=ground.heightAt(s.p.x/WORLD_SCALE+s.right.x*offset,s.p.z/WORLD_SCALE+s.right.z*offset);
        expect(Math.abs(y-previous)).toBeLessThan(.04);previous=y;
      }
    }
  });
});

import * as THREE from 'three';
import {createUtahLandscape} from '../client/prototypes/factory25dLandscape';
import {createTerrainSampler} from '../client/prototypes/factory25dTerrainSampler';
it('keeps the rendered factory terrain underneath the entire road',()=>{
  const landscape=createUtahLandscape();
  const terrain=landscape.group.children.find(o=>o instanceof THREE.Mesh && o.geometry.getAttribute('position').count>50000) as THREE.Mesh;
  expect(terrain).toBeDefined();
  const actual=createTerrainSampler(terrain.geometry,()=>-100);
  let largestGap=0;
  for(const s of landscape.motorTrack.samples) for(const side of [-1,0,1]){
    const x=(s.p.x+s.right.x*side*ROAD_HALF)/WORLD_SCALE;
    const z=(s.p.z+s.right.z*side*ROAD_HALF)/WORLD_SCALE;
    largestGap=Math.max(largestGap,Math.abs(s.p.y/WORLD_SCALE-actual(x,z)));
  }
  expect(largestGap).toBeLessThan(.025);
  landscape.group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
  landscape.materials.forEach(m=>m.dispose());
});
