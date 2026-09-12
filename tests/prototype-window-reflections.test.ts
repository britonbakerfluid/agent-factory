import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createWindowReflections} from '../client/prototypes/factory25dWindowReflections';
it('tracks nearby avatars, fades away from glass, and removes departed reflections',()=>{
 const scene=new THREE.Scene(), source=new THREE.Mesh(new THREE.PlaneGeometry(.86,.86),new THREE.MeshStandardMaterial({map:new THREE.Texture()}));
 source.userData.room='factory';source.position.set(1,.4,-3.9);scene.add(source);
 const camera=new THREE.OrthographicCamera(-8,8,5,-5,.1,50);camera.position.set(0,9,14);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const reflections=createWindowReflections(scene);
 for(let i=0;i<30;i++)reflections.update([{mesh:source}],camera,1/60,true);
 const reflection=scene.getObjectByName('window-avatar-reflection') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
 expect(reflection.visible).toBe(true);expect(reflection.position.z).toBeCloseTo(-4.46);expect(reflection.position.y).toBeGreaterThan(source.position.y);
 expect(reflection.material.map).toBe(source.material.map);expect(reflection.material.opacity).toBeGreaterThan(.1);expect(reflection.material.depthWrite).toBe(false);
 source.position.z=2;
 for(let i=0;i<60;i++)reflections.update([{mesh:source}],camera,1/60,true);
 expect(reflection.visible).toBe(false);
 reflections.update([],camera,1/60,true);expect(scene.getObjectByName('window-avatar-reflection')).toBeUndefined();reflections.dispose();
 source.geometry.dispose();source.material.map?.dispose();source.material.dispose();
});
