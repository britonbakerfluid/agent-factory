import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {actualTrack} from './terrain';
import {cameraGround,clearCamera} from '../src/racing/camera-ground';
test('smoothed chase camera and sightline clear the real mountain and raised road',()=>{
 const track=actualTrack();
 for(let i=0;i<track.samples.length;i+=12){
  const s=track.samples[i],prior=track.samples[(i+track.samples.length-12)%track.samples.length];
  for(const distance of [26,31]) {
   const target=s.p.clone().addScaledVector(s.tangent,7).add(new Vector3(0,1.35,0));
   const desired=s.p.clone().addScaledVector(s.tangent,-distance).add(new Vector3(0,19,0));
   const camera=prior.p.clone().lerp(desired,.12);
   clearCamera(track,camera,target);
   assert.ok(camera.y>=cameraGround(track,camera.x,camera.z)+1.99);
   for(let k=1;k<=20;k++){
    const p=target.clone().lerp(camera,k/20);
    assert.ok(p.y>=cameraGround(track,p.x,p.z)-.3,`blocked sightline at sample ${i}`);
   }
  }
 }
});
