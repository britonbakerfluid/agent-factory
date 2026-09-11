import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Explicitly selected, fixed siblings only. Moving parts retain their own meshes. */
export function batchStaticSiblings(parent:THREE.Object3D,meshes:THREE.Mesh[]){
 const groups=new Map<string,THREE.Mesh[]>();
 for(const mesh of meshes){
  if(mesh.parent!==parent||Array.isArray(mesh.material)||!mesh.visible)continue;
  const key=[mesh.material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask,Object.keys(mesh.geometry.attributes).sort().map(key=>key+mesh.geometry.attributes[key].itemSize).join(',')].join(':');
  const group=groups.get(key)??[];group.push(mesh);groups.set(key,group);
 }
 let saved=0;
 for(const meshes of groups.values()){
  if(meshes.length<2)continue;
  const geometries=meshes.map(mesh=>{if(mesh.matrixAutoUpdate)mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return g.applyMatrix4(mesh.matrix);});
  const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
  if(!geometry)continue;
  const first=meshes[0],merged=new THREE.Mesh(geometry,first.material);
  merged.name='batched-static-parts';merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;merged.renderOrder=first.renderOrder;merged.layers.mask=first.layers.mask;
  parent.add(merged);
  for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
  saved+=meshes.length-1;
 }
 return saved;
}

/** Flatten an explicitly static prop into its root, preserving each mesh transform. */
export function batchStaticProp(root:THREE.Object3D){
 root.updateWorldMatrix(true,true);
 const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
 const items:{mesh:THREE.Mesh;matrix:THREE.Matrix4}[]=[];
 root.traverseVisible(node=>{
  if(node instanceof THREE.Mesh&&!(node instanceof THREE.InstancedMesh)&&!Array.isArray(node.material)&&!node.material.transparent)
   items.push({mesh:node,matrix:new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld)});
 });
 for(const {mesh,matrix} of items){root.add(mesh);mesh.matrix.copy(matrix);mesh.matrixAutoUpdate=false;mesh.matrixWorldNeedsUpdate=true;}
 return batchStaticSiblings(root,items.map(item=>item.mesh));
}
