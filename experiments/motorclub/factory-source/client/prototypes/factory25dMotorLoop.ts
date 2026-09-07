import * as THREE from 'three';
import {roadPaintMaterial} from './factory25dRoadPaint';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTrack, WORLD_SCALE, ROAD_HALF, type Track } from './factory25dMotorTrack';
import type { WeatherVisualState } from '../sky/weather';

/** Small scenic drives, shared by the glass and patio mountain texture. No race records or network state. */
export function createMotorLoop(scene: THREE.Scene, ground: (x:number,z:number)=>number, preparedTrack?:Track) {
  const group=new THREE.Group();group.name='mountain-motor-loop';scene.add(group);
  const road=new THREE.Group();group.add(road);
  const roadMaterial=roadPaintMaterial(1450);roadMaterial.side=THREE.DoubleSide;
  const shoulderMaterial=new THREE.MeshStandardMaterial({color:'#a7a087',roughness:1,side:THREE.DoubleSide});
  let track:Track;
  let elapsed=0;
  let visible=true;
  let pending=true;
  let disposed=false;
  const fleet:{root:THREE.Object3D;period:number;phase:number}[]=[];
  function ribbon(left:number,right:number,lift:number,material:THREE.Material){
    const positions:number[]=[],indices:number[]=[],roadCoords:number[]=[];
    for(let i=0;i<=track.samples.length;i++){
      const s=track.samples[i%track.samples.length];
      for(const offset of [left,right]){positions.push((s.p.x+s.right.x*offset)/WORLD_SCALE,(s.p.y+lift)/WORLD_SCALE,(s.p.z+s.right.z*offset)/WORLD_SCALE);roadCoords.push(offset,i===track.samples.length?track.length:s.distance);}
      if(i<track.samples.length){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('roadCoord',new THREE.Float32BufferAttribute(roadCoords,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;road.add(mesh);
  }
  function setGround(heightAt:(x:number,z:number)=>number, prepared?:Track){
    road.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});road.clear();
    track=prepared??createTrack((x,z)=>heightAt(x/WORLD_SCALE,z/WORLD_SCALE)*WORLD_SCALE);
    roadMaterial.userData.roadLength.value=track.length;
    ribbon(-ROAD_HALF-.6,ROAD_HALF+.6,-.025,shoulderMaterial);
    ribbon(-ROAD_HALF,ROAD_HALF,.005,roadMaterial);
    // Center and edge markings are painted by the road material.
    pending=true;placeCars();
  }
  function placeCars(){
    for(const car of fleet){
      const cursor=((elapsed/car.period+car.phase)%1)*track.samples.length;
      const index=Math.floor(cursor),a=track.samples[index],b=track.samples[(index+1)%track.samples.length];
      car.root.position.copy(a.p).lerp(b.p,cursor-index).multiplyScalar(1/WORLD_SCALE);car.root.position.y+=.003;
      const forward=a.tangent.clone().lerp(b.tangent,cursor-index).normalize();
      const right=new THREE.Vector3(forward.z,0,-forward.x).normalize();
      const up=new THREE.Vector3().crossVectors(forward,right).normalize();
      car.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
    }
  }
  setGround(ground,preparedTrack);
  const ready=new GLTFLoader().loadAsync('/prototype25d/garage-distant-cars.glb').then(gltf=>{
    if(disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});return;}
    for(const [i,name] of ['porsche','mini','delorean','f1'].entries()){
      const model=gltf.scene.getObjectByName(name);if(!model)continue;
      model.removeFromParent();const root=new THREE.Group();root.name='distant-'+name;root.add(model);root.scale.setScalar(1.65/WORLD_SCALE);
      model.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=true;}});
      group.add(root);fleet.push({root,period:[78,84,90,73][i],phase:[.12,.38,.63,.87][i]});
    }
    pending=true;placeCars();
  }).catch(()=>{console.warn('The distant garage cars could not load; mountain scenery remains available.');});
  return {
    ready,
    setGround,
    update(dt:number,weather:WeatherVisualState,night:boolean,paused:boolean){
      // The existing mountain wind clock paints motion at 12 Hz; only asset/terrain changes need an extra repaint.
      const changed=pending;pending=false;
      if(!paused)elapsed+=Math.max(0,Math.min(.1,dt));
      placeCars();
      roadMaterial.color.set('#37394b').lerp(new THREE.Color('#c4cbd0'),weather.snow01*.65);
      shoulderMaterial.color.set('#a7a087').lerp(new THREE.Color('#d0d7dc'),weather.snow01*.8);
      // Lighting/fog are inherited from the mountain scene. Park motion under reduced motion.
      visible=weather.fog01<.98;group.visible=visible;
      void night;
      return changed;
    },
    get carCount(){return fleet.length;},
    dispose(){disposed=true;group.removeFromParent();const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();group.traverse(o=>{if(o instanceof THREE.Mesh){geos.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mats.add(m));}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());},
  };
}
