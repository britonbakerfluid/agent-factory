import * as THREE from 'three';
import {avatarTexture,setAvatarTextureFrame} from './factory25dAvatarTexture';
import {stepSpring,limitFabricStretch,GRAB_GRAVITY,GRAB_REST_LENGTH} from '../grab/legacyPickupPhysics';
import type { AvatarConfig } from '@shared/types';
import { resolveAvatar } from '../rendering/avatarPainter';
import {ELEVATOR_BODY,FACTORY_BODY_RADIUS,FACTORY_ELEVATOR,GARAGE_ELEVATOR,GARAGE_WORLD_Z,factoryWorldPoint,factoryScenePoint,recoverFactoryPosition,toFactoryWorld,fromFactoryWorld,type FactoryRoom} from '@shared/factory25d-layout';

/** A screen point outside the room lands on the nearest clear spot on this floor. */
export function pickupLanding(point:{x:number;z:number},room:FactoryRoom){
  const bounded=factoryWorldPoint(point,room);
  bounded.x=THREE.MathUtils.clamp(bounded.x,room==='garage'?-11.8:room==='patio'?8.2:-7.8,room==='garage'?11.8:room==='patio'?23.8:7.8);
  bounded.z=THREE.MathUtils.clamp(bounded.z,room==='garage'?19.7:-4.3,room==='garage'?40:13.7);
  if(room!=='patio'){
    const lift=room==='garage'?GARAGE_ELEVATOR:FACTORY_ELEVATOR;
    const front=ELEVATOR_BODY.far+FACTORY_BODY_RADIUS+.04+(room==='garage'?GARAGE_WORLD_Z:0);
    // A drop over the shaft belongs on the floor in front of its doors.
    if(Math.abs(bounded.x-lift.x)<ELEVATOR_BODY.width/2+FACTORY_BODY_RADIUS&&bounded.z<front)bounded.z=front;
  }
  return recoverFactoryPosition(toFactoryWorld(bounded));
}

/** Preserve the spring velocity on release and resolve the resulting landing safely. */
export function pickupReleaseLanding(mesh:THREE.Mesh){
  const landing=mesh.userData.pickupLanding,velocity=mesh.userData.pickupVelocity;
  if(!landing||!velocity)return landing;
  const gravity=GRAB_GRAVITY*(.86/32),up=velocity.y;
  const flight=(up+Math.sqrt(up*up+2*gravity*(mesh.userData.pickupHeight??.18)))/gravity;
  return factoryScenePoint(fromFactoryWorld(pickupLanding({x:landing.x+velocity.x*flight,z:landing.z},mesh.userData.room??'factory')));
}

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

const UNIT=.86/32;
/** Original spring, stretch limit and gravity, adapted from pixel coordinates to the sprite plane. */
export function createPickupMotion(mesh:THREE.Mesh,avatar:AvatarConfig){
  const material=mesh.material as THREE.Material,depthTest=material.depthTest,depthWrite=material.depthWrite,transparent=material.transparent,renderOrder=mesh.renderOrder;
  const fold=createPickupFold(mesh,avatar),body={x:0,y:0,vx:0,vy:0};
  let phase:'idle'|'held'|'falling'|'landing'='idle',last=performance.now(),lifted=false,liftedAt=0;
  let landedAt=0,highFall=false,landingSlide=0;const impactPoint=new THREE.Vector3(),fallHome=new THREE.Vector3();
  const spriteMaterial=material as THREE.MeshStandardMaterial,normalMap=spriteMaterial.map;let heroMap:THREE.CanvasTexture|undefined;
  const planted={x:0,y:0};let heldZ=0;
  const world=new THREE.Vector3(),local=new THREE.Vector3(),home=new THREE.Vector3(),target=new THREE.Vector3();
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1));
  return {get active(){return phase!=='idle';},get shadowAirborne(){return lifted&&(phase==='held'||phase==='falling');},get stage(){return phase==='held'?(lifted?'lifted':'pulling'):phase;},
    update(camera:THREE.Camera,canvas:HTMLCanvasElement,pointer?:{x:number;y:number}){
      const now=performance.now(),dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;home.copy(mesh.position);
      if(pointer){
        if(phase!=='held'){mesh.getWorldPosition(world);plane.constant=-world.z;heldZ=mesh.position.z;body.x=mesh.position.x/UNIT;body.y=-mesh.position.y/UNIT;body.vx=body.vy=0;planted.x=body.x;planted.y=body.y;lifted=false;liftedAt=0;mesh.userData.pickupHeight=.18;phase='held';}
        const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((pointer.x-rect.left)/rect.width*2-1,1-(pointer.y-rect.top)/rect.height*2),camera);
        if(ray.ray.intersectPlane(plane,target)){
          local.copy(target);mesh.parent!.worldToLocal(local);const pin={x:local.x/UNIT,y:-local.y/UNIT},offset=-fold.base/UNIT;
          const hanging={x:pin.x,y:pin.y+GRAB_REST_LENGTH-offset};
          // Stretch the grabbed material first. A horizontal tug cannot pick the feet up.
          const downwardStretch=pin.y-(planted.y+offset);
          if(!lifted&&(hanging.y<planted.y||downwardStretch>GRAB_REST_LENGTH*1.4)){
            lifted=true;liftedAt=now;
            if(downwardStretch>GRAB_REST_LENGTH*1.4){body.x=hanging.x;body.y=hanging.y;body.vx=body.vy=0;}
          }
          // Gain altitude gently while held; preserve the cursor-to-shirt connection.
          if(lifted)mesh.userData.pickupHeight=.18+2*(1-Math.exp(-(now-liftedAt)/5000));
          if(!lifted){body.x=planted.x;body.y=planted.y;body.vx=body.vy=0;}
          else for(let t=0;t<dt;t+=1/120){
            const step=Math.min(1/120,dt-t);stepSpring(body,hanging,step);limitFabricStretch(body,pin,offset,1);
            // Once airborne, only release ends the lift; the old floor no longer clamps motion.
          }
          mesh.position.set(body.x*UNIT,-body.y*UNIT,heldZ);
          fold.set(true,now,lifted?-body.vx*.06*Math.PI/180:0,target);
        }
      }else{
        if(phase==='held'){
          // Freeze the same safe landing used by the release command and shadow.
          fallHome.copy(home);
          const landing=mesh.userData.pickupLanding;
          if(landing){fallHome.x=landing.x;fallHome.z=landing.z;}
          // Rebase onto the destination depth without a screen-space jump.
          local.set(body.x*UNIT,-body.y*UNIT,heldZ);mesh.parent!.localToWorld(local);local.project(camera);
          ray.setFromCamera(new THREE.Vector2(local.x,local.y),camera);
          mesh.parent!.localToWorld(world.copy(fallHome));plane.constant=-world.z;
          if(ray.ray.intersectPlane(plane,target)){mesh.parent!.worldToLocal(target);body.x=target.x/UNIT;body.y=-target.y/UNIT;}
          const height=Math.max(0,(-body.y*UNIT-fallHome.y)/UNIT);
          const flight=(-body.vy+Math.sqrt(body.vy*body.vy+2*GRAB_GRAVITY*height))/GRAB_GRAVITY;
          highFall=(mesh.userData.pickupHeight??0)>1||(-body.y*UNIT-fallHome.y)>1;
          const travel=fallHome.x-body.x*UNIT;
          landingSlide=highFall&&!matchMedia('(prefers-reduced-motion: reduce)').matches
            ? Math.sign(travel)*Math.min(.18,Math.abs(travel)*.25) : 0;
          // Touch down a little before the final safe spot, then skid into it.
          // The final position still agrees with the server and release shadow.
          if(landing)fallHome.x-=landingSlide;
          else landingSlide=0;
          // The camera-depth rebase changes fall height. Match lateral travel to
          // that actual flight time instead of overshooting and snapping back.
          if(landing)body.vx=flight>1e-4?(fallHome.x/UNIT-body.x)/flight:0;
          else fallHome.x=(body.x+body.vx*flight)*UNIT;
          highFall=(mesh.userData.pickupHeight??0)>1||(-body.y*UNIT-fallHome.y)>1;
          phase='falling';
        }
        fold.set(false);mesh.rotation.z=0;
        if(phase==='falling'){
          body.x+=body.vx*dt;
          body.y+=body.vy*dt+.5*GRAB_GRAVITY*dt*dt;body.vy+=GRAB_GRAVITY*dt;
          if(body.y>=-fallHome.y/UNIT&&body.vy>=0){phase=highFall?'landing':'idle';mesh.position.copy(fallHome);impactPoint.copy(fallHome);landedAt=now;}
          else mesh.position.set(body.x*UNIT,-body.y*UNIT,fallHome.z);
        }
      }
      if(phase==='landing'){
        mesh.position.copy(impactPoint);
        const slideProgress=Math.min(1,(now-landedAt)/350);
        mesh.position.x+=landingSlide*(1-Math.pow(1-slideProgress,3));
        if(!heroMap&&typeof document.createElement==='function')heroMap=avatarTexture(avatar,['hero_land']).texture;
        const age=now-landedAt,frame=age<350?0:age<500?1:age<650?2:3;
        if(heroMap){spriteMaterial.map=heroMap;setAvatarTextureFrame(heroMap,0,frame);}
        if(age>=800)phase='idle';
      }else if(heroMap&&spriteMaterial.map===heroMap)spriteMaterial.map=normalMap;
      if(phase==='idle'&&heroMap)spriteMaterial.map=normalMap;
      const airborne=phase==='held'&&lifted;material.transparent=phase==='held'?true:transparent;material.depthTest=airborne?false:depthTest;material.depthWrite=airborne?false:depthWrite;mesh.renderOrder=phase==='held'?1000:renderOrder;
      if(phase==='held')mesh.userData.pickupVelocity={x:body.vx*UNIT,y:-body.vy*UNIT};
      mesh.userData.pickupFalling=phase==='falling';
      if(phase==='idle')delete mesh.userData.pickupLanding;
      return phase;
    },dispose(){spriteMaterial.map=normalMap;heroMap?.dispose();material.transparent=transparent;material.depthTest=depthTest;material.depthWrite=depthWrite;mesh.renderOrder=renderOrder;fold.dispose();}};
}

/** Staff preserve click actions, fall when released, then return to their post. */
export function createStaffPickup(mesh:THREE.Mesh,button:HTMLButtonElement,canvas:HTMLCanvasElement,avatar:AvatarConfig){
  const abort=new AbortController(),options={signal:abort.signal,capture:true},motion=createPickupMotion(mesh,avatar);
  let press:{id:number;x:number;y:number}|undefined,pointer:{x:number;y:number}|undefined,suppress=false;
  const texture=(mesh.material as THREE.MeshStandardMaterial).map,pressPose=new THREE.Vector2();
  let walkMap:THREE.CanvasTexture|undefined;
  let returning=false,lastFrame=performance.now();const dropped=new THREE.Vector3();
  function move(e:PointerEvent){if(!press||e.pointerId!==press.id)return;if(!pointer&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<6)return;pointer={x:e.clientX,y:e.clientY};suppress=true;document.documentElement.classList.add('is-grabbing');e.preventDefault();e.stopImmediatePropagation();}
  function end(e?:PointerEvent){if(!press||e&&e.pointerId!==press.id)return;if(pointer){returning=true;dropped.copy(mesh.position);const landing=pickupReleaseLanding(mesh);if(landing){mesh.userData.pickupLanding=landing;dropped.x=landing.x;dropped.z=landing.z;}}pointer=undefined;press=undefined;document.documentElement.classList.remove('is-grabbing');}
  button.addEventListener('pointerdown',e=>{if(e.button!==0||!mesh.visible||document.body.classList.contains('basketball-input-active')||canvas.classList.contains('holding-basketball'))return;press={id:e.pointerId,x:e.clientX,y:e.clientY};if(texture)pressPose.copy(texture.offset);suppress=false;button.setPointerCapture(e.pointerId);e.stopPropagation();},options);
  button.addEventListener('pointermove',move,options);button.addEventListener('pointerup',end,options);button.addEventListener('pointercancel',end,options);
  button.addEventListener('click',e=>{if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation();}},options);
  window.addEventListener('blur',()=>end(),{signal:abort.signal});
  return {get shadowAirborne(){return motion.shadowAirborne;},get airborne(){return motion.stage==='lifted';},get held(){return !!pointer;},get busy(){return !!pointer||motion.active||returning;},
    update(camera:THREE.Camera){
      const now=performance.now(),dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
      if(walkMap&&(mesh.material as THREE.MeshStandardMaterial).map===walkMap)(mesh.material as THREE.MeshStandardMaterial).map=texture;
      if(!mesh.visible)end();const home=mesh.position.clone();
      // First land beneath the release, then slide back at walking speed.
      if(returning){mesh.position.x=dropped.x;mesh.position.z=dropped.z;}
      const phase=motion.update(camera,canvas,pointer);
      if(pointer&&motion.stage==='pulling'&&texture)texture.offset.copy(pressPose);
      if(returning){dropped.copy(mesh.position);if(phase==='idle'){
        const delta=home.clone().sub(dropped),distance=delta.length();
        if(distance<.035){returning=false;mesh.position.copy(home);}else{
          if(!walkMap&&typeof document.createElement==='function')walkMap=avatarTexture(avatar,['walk_right','walk_left','walk_down','walk_up']).texture;
          if(walkMap){const row=Math.abs(delta.x)>Math.abs(delta.z)?delta.x>0?0:1:delta.z>0?2:3;setAvatarTextureFrame(walkMap,row,Math.floor(now/120)%4);(mesh.material as THREE.MeshStandardMaterial).map=walkMap;}
          dropped.addScaledVector(delta,Math.min(1,2.1*dt/distance));mesh.position.copy(dropped);
        }
      }}
    },dispose(){end();abort.abort();motion.dispose();walkMap?.dispose();}};
}

/** Follow the rendered feet (including spring lag), then freeze that landing on release. */
export function updatePickupShadow(mesh:THREE.Mesh,shadow:THREE.Mesh,camera:THREE.Camera,active:boolean,feet=new THREE.Vector3(0,-.35,0)){
  const scale=shadow.userData.pickupBaseScale??=shadow.scale.clone();shadow.scale.copy(scale);
  if(!active)return;
  if(!mesh.userData.pickupFalling){
    mesh.updateWorldMatrix(true,false);
    const projected=mesh.localToWorld(feet.clone());
    // Increasing altitude moves the floor footprint farther below the held feet.
    projected.y-=mesh.userData.pickupHeight??.18;projected.project(camera);
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
    const floor=shadow.getWorldPosition(new THREE.Vector3()),point=new THREE.Vector3();
    if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-floor.y),point)){
      shadow.parent!.worldToLocal(point);
      mesh.userData.pickupLanding=factoryScenePoint(fromFactoryWorld(pickupLanding(point,mesh.userData.room??'factory')));
    }
  }
  const landing=mesh.userData.pickupLanding;
  if(landing){shadow.position.x=landing.x;shadow.position.z=landing.z;}
}
