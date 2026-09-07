import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {WORLD_SCALE,type Track} from './core';
export async function createWindowTraffic(scene:THREE.Scene,track:Track){
 const gltf=await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/distant-cars.glb');
 const cars:THREE.Group[]=[];let elapsed=0;
 for(const name of ['porsche','mini','delorean','f1']){
  const model=gltf.scene.getObjectByName(name);if(!model)continue;model.removeFromParent();const root=new THREE.Group();root.add(model);root.scale.setScalar(1.65/WORLD_SCALE);scene.add(root);cars.push(root);
 }
 return (dt:number,paused:boolean)=>{
  if(!paused)elapsed+=Math.min(.1,Math.max(0,dt));
  cars.forEach((car,i)=>{const cursor=((elapsed/[78,84,90,73][i]+[.12,.38,.63,.87][i])%1)*track.samples.length;const n=Math.floor(cursor),a=track.samples[n],b=track.samples[(n+1)%track.samples.length];car.position.copy(a.p).lerp(b.p,cursor-n).multiplyScalar(1/WORLD_SCALE);car.position.y+=.003;
   const forward=a.tangent.clone().lerp(b.tangent,cursor-n).normalize(),right=new THREE.Vector3(forward.z,0,-forward.x).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
  });
 };
}
