import {it,expect} from 'vitest';
import * as THREE from 'three';
import {createDjDecks} from '../client/prototypes/factory25dDjDecks';
import {batchStaticSiblings,batchStaticProp} from '../client/prototypes/factory25dStaticBatch';
it('preserves transformed geometry bounds and live shadow flags',()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 for(let i=0;i<4;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);mesh.position.set(i*2,i,0);mesh.rotation.y=i*.3;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 const before=new THREE.Box3().setFromObject(group);
 expect(batchStaticSiblings(group,[...group.children] as THREE.Mesh[])).toBe(3);
 const after=new THREE.Box3().setFromObject(group);
 expect(before.min.distanceTo(after.min)).toBeLessThan(.00001);expect(before.max.distanceTo(after.max)).toBeLessThan(.00001);
 expect((group.children[0] as THREE.Mesh).castShadow).toBe(true);
});
it('reduces booth draw calls while keeping spinning platters separate',()=>{
 const decks=createDjDecks(new THREE.Group());
 console.log('DJ booth draw calls saved:',decks.booth.userData.savedDrawCalls);
 expect(decks.booth.userData.savedDrawCalls).toBeGreaterThan(15);
 const platter=decks.booth.getObjectByName('spinning-vinyl')!;
 decks.update(1,true,false);const rotation=platter.rotation.y;decks.update(2,true,false);expect(platter.rotation.y).not.toBe(rotation);
});

it('preserves nested plant transforms, shared geometry and instances',()=>{
 const root=new THREE.Group(),branch=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(.2,1,.1);
 branch.scale.set(2,.8,1);branch.rotation.z=.4;root.add(branch);
 for(let i=0;i<3;i++){const leaf=new THREE.Mesh(geometry,material);leaf.position.x=i*.3;leaf.rotation.y=i*.5;branch.add(leaf);}
 const instances=new THREE.InstancedMesh(geometry,material,1);branch.add(instances);
 const before=new THREE.Box3().setFromObject(root);expect(batchStaticProp(root)).toBe(2);
 const after=new THREE.Box3().setFromObject(root);expect(before.min.distanceTo(after.min)).toBeLessThan(.00001);expect(before.max.distanceTo(after.max)).toBeLessThan(.00001);
 expect(instances.parent).toBe(branch);
});
