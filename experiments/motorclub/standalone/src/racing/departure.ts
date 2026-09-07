import * as THREE from 'three';
/** Garage-scale driver and departure staging; car models remain the original collection. */
export function createDeparture(scene:THREE.Scene,camera:THREE.OrthographicCamera,target:THREE.Vector3,shutter:THREE.Group){
  const driver=new THREE.Group();driver.name='garage-driver';scene.add(driver);
  const parts:THREE.Mesh[]=[];
  function part(size:number[],at:number[],color:string){const m=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),new THREE.MeshStandardMaterial({color,roughness:1}));m.position.set(...at as [number,number,number]);m.castShadow=true;driver.add(m);parts.push(m);return m;}
  part([.28,.36,.18],[0,.59,0],'#498a85');part([.23,.23,.23],[0,.9,0],'#cca784');part([.25,.08,.25],[0,1.04,0],'#293746');
  const legs=[part([.10,.29,.12],[-.08,.25,0],'#293746'),part([.10,.29,.12],[.08,.25,0],'#293746')];
  part([.10,.3,.11],[-.21,.59,0],'#498a85');part([.10,.3,.11],[.21,.59,0],'#498a85');
  driver.position.set(0,0,4.7);
  let active:undefined|{car:THREE.Group;start:THREE.Vector3;rotation:THREE.Euler;time:number;resolve:()=>void;camera:THREE.Vector3;target:THREE.Vector3;zoom:number;path:THREE.CatmullRomCurve3};
  let parked:typeof active;
  function restore(){const a=active??parked;if(a){a.car.position.copy(a.start);a.car.rotation.copy(a.rotation);a.car.visible=true;camera.position.copy(a.camera);camera.zoom=a.zoom;camera.updateProjectionMatrix();target.copy(a.target);a.resolve();}active=undefined;parked=undefined;driver.visible=true;driver.position.set(0,0,4.7);driver.scale.setScalar(1);shutter.scale.y=1;shutter.position.y=0;}
  return {restore,
    start(car:THREE.Group){restore();return new Promise<void>(resolve=>{
      const start=car.position.clone();
      active={car,start,rotation:car.rotation.clone(),time:0,resolve,camera:camera.position.clone(),target:target.clone(),zoom:camera.zoom,path:new THREE.CatmullRomCurve3([start.clone(),new THREE.Vector3(0,.025,start.z+.6),new THREE.Vector3(0,.025,4.5),new THREE.Vector3(-5.25,.025,4.5),new THREE.Vector3(-5.25,.025,-3.7),new THREE.Vector3(-5.25,.025,-9)],false,'centripetal')};
    });},
    update(dt:number){
      if(!active)return false;const a=active;a.time+=document.hidden?0:Math.min(dt,.05);
      const side=a.start.clone().add(new THREE.Vector3(-.8,0,.3));
      if(a.time<1.6){const t=Math.min(1,a.time/1.6);driver.position.lerpVectors(new THREE.Vector3(0,0,4.7),side,t);legs.forEach((l,i)=>l.rotation.x=Math.sin(a.time*13+i*Math.PI)*.45);}
      else if(a.time<2.3){const t=(a.time-1.6)/.7;driver.position.lerpVectors(side,a.start.clone().add(new THREE.Vector3(0,.25,0)),t);driver.scale.setScalar(1-t*.65);}
      else {driver.visible=false;const t=Math.min(1,(a.time-2.3)/5);const p=a.path.getPointAt(t),forward=a.path.getTangentAt(t);a.car.position.copy(p);const yaw=Math.atan2(forward.x,forward.z);a.car.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),1-Math.exp(-dt*8));a.car.traverse(o=>{if(o.userData.role==='wheel')o.rotation.x-=dt*6;});}
      const open=THREE.MathUtils.smoothstep(a.time,1.6,3);shutter.scale.y=1-open*.96;shutter.position.y=open*2.6;
      const focus=a.time<2.3?driver.position:a.car.position;
      target.lerp(focus.clone().add(new THREE.Vector3(0,.7,0)),1-Math.exp(-dt*3));
      camera.position.lerp(focus.clone().add(new THREE.Vector3(4,6,9)),1-Math.exp(-dt*2));camera.zoom=THREE.MathUtils.damp(camera.zoom,1.7,2,dt);camera.updateProjectionMatrix();
      if(a.time>=7.3){a.car.visible=false;parked=a;active=undefined;a.resolve();}
      return true;
    }
  };
}
