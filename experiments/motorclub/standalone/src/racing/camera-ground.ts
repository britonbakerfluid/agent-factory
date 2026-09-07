import {Vector3} from 'three';
import {roadContact,ROAD_HALF,type Track} from './core';
export function cameraGround(track:Track,x:number,z:number){
  const c=roadContact(track,new Vector3(x,0,z));
  return Math.max(track.heightAt(x,z),Math.abs(c.lateral)<ROAD_HALF+1.5 && c.distance<ROAD_HALF+2 ? c.p.y : -Infinity);
}
/** Correct the final smoothed pose, including its near-plane footprint and sightline. */
export function clearCamera(track:Track,position:Vector3,target:Vector3){
  target.y=Math.max(target.y,cameraGround(track,target.x,target.z)+1.5);
  for(const [dx,dz] of [[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]])
    position.y=Math.max(position.y,cameraGround(track,position.x+dx,position.z+dz)+2);
  const steps=Math.max(16,Math.ceil(position.distanceTo(target)*2));
  for(let i=1;i<=steps;i++){
    const t=i/steps,x=target.x+(position.x-target.x)*t,z=target.z+(position.z-target.z)*t;
    const floor=cameraGround(track,x,z)+.6;
    position.y=Math.max(position.y,target.y+(floor-target.y)/t);
  }
}
