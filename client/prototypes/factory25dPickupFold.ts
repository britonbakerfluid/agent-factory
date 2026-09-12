import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { resolveAvatar } from '../rendering/avatarPainter';

/** A pinched fold uses the same collar / long-hair choice as the original room. */
export function createPickupFold(mesh:THREE.Mesh,avatar:AvatarConfig){
  const colors=resolveAvatar(avatar),hair=colors.hairStyle===2;
  const color=new THREE.Color(hair?colors.hairColor:colors.shirtColor);
  const geometry=new THREE.BufferGeometry();
  const base=hair?.32:.027,width=hair?.065:.095,tip=base+.27;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-width,base,.015,0,tip,.015,0,base,.015,0,base,.015,0,tip,.015,width,base,.015],3));
  const light=color.clone().multiplyScalar(1.2),dark=color.clone().multiplyScalar(.65);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute([...light.toArray(),...light.toArray(),...light.toArray(),...dark.toArray(),...dark.toArray(),...dark.toArray()],3));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:true});
  const fold=new THREE.Mesh(geometry,material);fold.visible=false;fold.renderOrder=999;mesh.add(fold);
  const knot=new THREE.Mesh(new THREE.PlaneGeometry(.06,.06),new THREE.MeshBasicMaterial({color:color.clone().multiplyScalar(1.35),side:THREE.DoubleSide,depthTest:false,depthWrite:false,transparent:true}));knot.renderOrder=1002;knot.visible=false;mesh.add(knot);
  const tipPoint=new THREE.Vector3();
  // The fabric is behind the head, as in the original renderer.
  fold.position.z=-.035;
  return {base,hair,set(active:boolean,_time=performance.now(),sway=0,target?:THREE.Vector3){
    fold.visible=knot.visible=active;if(!active)return;
    mesh.rotation.z=THREE.MathUtils.clamp(sway,-.244,.244);
    if(target){mesh.updateWorldMatrix(true,false);tipPoint.copy(target);mesh.worldToLocal(tipPoint);
      knot.position.set(tipPoint.x,tipPoint.y,.035);
      const positions=geometry.getAttribute('position');for(const index of [1,4])positions.setXYZ(index,tipPoint.x,tipPoint.y,.015);positions.needsUpdate=true;geometry.computeBoundingSphere();}
  },dispose(){knot.removeFromParent();knot.geometry.dispose();knot.material.dispose();fold.removeFromParent();geometry.dispose();material.dispose();}};
}

