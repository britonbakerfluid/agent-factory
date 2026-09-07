import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {CLEAR_WEATHER} from '../client/sky/weather';
vi.mock('three/examples/jsm/loaders/GLTFLoader.js',()=>({GLTFLoader:class{async loadAsync(){const scene=new THREE.Group();for(const name of ['porsche','mini','delorean','f1']){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,2),new THREE.MeshStandardMaterial());mesh.name=name;scene.add(mesh);}return {scene};}}}));
import {createMotorLoop} from '../client/prototypes/factory25dMotorLoop';
describe('distant garage drives',()=>{
 it('loads four distinct cars and moves them along the route',async()=>{const scene=new THREE.Scene(),loop=createMotorLoop(scene,()=>0);await loop.ready;expect(loop.carCount).toBe(4);const car=scene.getObjectByName('distant-mini')!,before=car.position.clone();for(let i=0;i<20;i++)loop.update(.1,CLEAR_WEATHER,false,false);expect(car.position.distanceTo(before)).toBeGreaterThan(.1);loop.dispose();expect(scene.children).toHaveLength(0);});
 it('parks cars while paused or reduced motion is active',async()=>{const scene=new THREE.Scene(),loop=createMotorLoop(scene,()=>0);await loop.ready;const car=scene.getObjectByName('distant-porsche')!,before=car.position.clone();loop.update(10,CLEAR_WEATHER,false,true);expect(car.position.distanceTo(before)).toBe(0);loop.dispose();});
 it('re-grounds both road and cars when the mountain style changes',async()=>{const scene=new THREE.Scene(),loop=createMotorLoop(scene,()=>0);await loop.ready;const car=scene.getObjectByName('distant-f1')!,y=car.position.y;loop.setGround(()=>2);expect(car.position.y-y).toBeCloseTo(2,5);loop.dispose();});
 it('does not force extra mountain renders for each animation frame',async()=>{const loop=createMotorLoop(new THREE.Scene(),()=>0);await loop.ready;expect(loop.update(.01,CLEAR_WEATHER,false,false)).toBe(true);expect(loop.update(.01,CLEAR_WEATHER,false,false)).toBe(false);loop.dispose();});
 it('ships the real compact vertex-colored Blender asset',()=>{const bytes=readFileSync('client/assets/prototype25d/garage-distant-cars.glb');const g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());expect(g.nodes.map((n:{name:string})=>n.name).sort()).toEqual(['delorean','f1','mini','porsche']);let triangles=0;for(const mesh of g.meshes)for(const primitive of mesh.primitives){expect(primitive.attributes.COLOR_0).toBeDefined();triangles+=g.accessors[primitive.indices].count/3;}expect(triangles).toBeLessThan(9000);expect(bytes.length).toBeLessThan(700000);});
});
