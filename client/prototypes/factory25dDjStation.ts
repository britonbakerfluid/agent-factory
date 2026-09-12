import * as THREE from 'three';
import {propPart,standard} from './factory25dProps';
import {signTexture} from './factory25dLabels';

export function createDjStation(group:THREE.Group,canvas:HTMLCanvasElement,panel:HTMLElement,actions:{listen():void;skip():void}) {
  const layer=document.createElement('div');layer.className='dj-station-screen';document.body.append(layer);
  panel.classList.add('dj-mounted-panel');layer.append(panel);
  const screenMount=new THREE.Group();screenMount.position.set(0,.79,.40);screenMount.rotation.set(-Math.PI/2-.35,0,Math.PI);screenMount.scale.setScalar(.8);group.add(screenMount);
  propPart(screenMount,[1.21,.69,.012],[0,0,-.006],standard('#101b23'));
  propPart(group,[.12,.17,.08],[0,.675,.40],standard('#101b23'));
  const buttons:THREE.Mesh[]=[];
  for(const [i,text] of ['PLAY','SKIP'].entries()){
    const mesh=propPart(group,[.17,.045,.10],[i*.24-.12,.608,-.30],standard(i?'#c39255':'#73b8a8'));
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.13,.052),new THREE.MeshBasicMaterial({map:signTexture(text,'#13242b',i?'#c39255':'#73b8a8'),depthWrite:false}));
    label.rotation.x=-Math.PI/2;label.rotation.z=Math.PI;label.position.y=.024;mesh.add(label);buttons.push(mesh);
  }
  const targets=buttons.map((mesh,index)=>{
    const button=document.createElement('button');button.className='dj-physical-target';button.type='button';
    button.setAttribute('aria-label',index?'Skip song on DJ deck':'Play music on DJ deck');
    button.addEventListener('click',()=>{mesh.userData.pressedUntil=performance.now()+180;if(index)actions.skip();else actions.listen();});
    document.body.append(button);return button;
  });
  let active=false,blend=0,current:THREE.Camera=new THREE.Camera();
  const closeCamera=new THREE.OrthographicCamera(),goal=new THREE.Vector3(),eye=new THREE.Vector3();
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const abort=new AbortController();
  window.addEventListener('pointerdown',event=>{
    if(!active||!panel.classList.contains('radio-minimized')||event.target!==canvas)return;
    const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);
    ray.setFromCamera(pointer,current);const hit=ray.intersectObjects(buttons,false)[0];if(!hit)return;
    event.preventDefault();event.stopImmediatePropagation();
    const index=buttons.indexOf(hit.object as THREE.Mesh);buttons[index].userData.pressedUntil=performance.now()+180;
    if(index===0)actions.listen();else actions.skip();
  },{capture:true,signal:abort.signal});
  return {
    isActive: () => active || blend > 0,
    setActive(value:boolean){active=value;document.body.classList.toggle('dj-station-open',active || blend > 0);},
    cameraFor(base:THREE.OrthographicCamera|THREE.PerspectiveCamera,dt:number){
      blend=THREE.MathUtils.clamp(blend+(active?1:-1)*dt/.7,0,1);
      document.body.classList.toggle('dj-station-open',active || blend > 0);
      if(!blend||!(base instanceof THREE.OrthographicCamera))return base;
      const t=blend*blend*(3-2*blend);
      group.localToWorld(goal.set(0,.65,0));group.localToWorld(eye.set(0,3.3,-2.0));
      closeCamera.copy(base);closeCamera.position.copy(eye);closeCamera.lookAt(goal);
      closeCamera.quaternion.slerp(base.quaternion,1-t);closeCamera.position.lerp(base.position,1-t);
      const aspect=(base.right-base.left)/(base.top-base.bottom);
      let height=THREE.MathUtils.lerp((base.top-base.bottom)/base.zoom,1.72,t);
      closeCamera.zoom=1;closeCamera.left=-height*aspect/2;closeCamera.right=height*aspect/2;closeCamera.top=height/2;closeCamera.bottom=-height/2;
      closeCamera.updateProjectionMatrix();closeCamera.updateMatrixWorld();return closeCamera;
    },
    update(camera:THREE.Camera){
      current=camera;
      const minimized=panel.classList.contains('radio-minimized');
      layer.classList.toggle('dj-station-minimized',minimized);
      layer.classList.toggle('dj-station-records',active&&minimized);
      layer.hidden=!active&&!minimized;screenMount.visible=true;
      if(!active){targets.forEach(target=>{target.hidden=true;});return;}
      const r=canvas.getBoundingClientRect();
      // Keep text and touch targets in viewport pixels. Only the physical deck
      // buttons follow the camera; the existing video stays in the same DOM.
      targets.forEach((target,index)=>{
        target.hidden=!active||!minimized;
        const point=buttons[index].getWorldPosition(new THREE.Vector3()).project(camera);
        target.style.left=`${r.left+(point.x+1)*r.width/2}px`;target.style.top=`${r.top+(1-point.y)*r.height/2}px`;
        target.style.width=`${.17*r.height/1.72}px`;target.style.height=`${.085*r.height/1.72}px`;
      });
      for(const button of buttons)button.position.y=performance.now()<(button.userData.pressedUntil??0)?.592:.608;
    },
    dispose(){targets.forEach(target=>target.remove());abort.abort();layer.remove();document.body.classList.remove('dj-station-open');}
  };
}
