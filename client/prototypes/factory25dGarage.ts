import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {propPart,standard} from './factory25dProps';
import './factory25dGarage.css';
import {furnishGarage,garageConcrete} from './factory25dGarageFurnishings';
import {contactShadow} from './factory25dContactShadows';
import {createElevator} from './factory25dElevator';
import {elevatorTrip} from './factory25dElevatorTrip';
import {FACTORY_ELEVATOR,GARAGE_ELEVATOR,factoryRoomAt,fromFactoryWorld} from '@shared/factory25d-layout';
import type { WorldAgent } from '@shared/types';
import { elevatorApproachOpenness } from './factory25dManualTravel';
import { createFloorSection, floorTravelCamera, GARAGE_SECTION_X,upperFloorLift } from './factory25dFloorTransition';
import { GARAGE_CAR_BAYS, GARAGE_CAR_SCALE, GARAGE_CAR_YAW, type GarageCarId } from '@shared/factory25d-garage';
import { createGarageCarAnimation } from './factory25dGarageCarAnimation';
import { createMiniWorkstation } from './factory25dMiniWork';
import { onFactoryMessage } from './factory25dBoardData';
import { createGarageLighting } from './factory25dGarageLighting';
import type { SceneLightSwitch } from './factory25dLightSwitches';
import { createGarageWindows } from './factory25dGarageWindows';

const LEVEL=-12;
export function createGarage(factory:THREE.Scene,canvas:HTMLCanvasElement,home:THREE.OrthographicCamera,windowMaterial:THREE.Material,skyMaterial?:THREE.Material,cloudMaterial?:THREE.Material){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#08091a');
 const room=new THREE.Group();room.position.y=LEVEL;scene.add(room);
 const camera=home.clone();
 const floorSection=createFloorSection(factory);
 const previewValue=import.meta.env.DEV?new URLSearchParams(location.search).get('floorPreview'):null;
 const floorPreview=previewValue!==null&&Number.isFinite(Number(previewValue))?THREE.MathUtils.clamp(Number(previewValue),0,1):undefined;
 let floorProgress=0,physicalTrip=false;
 const trim=standard('#414b65'),dark=standard('#171d31'),paint=standard('#828a9f');
 const box=(size:[number,number,number],at:[number,number,number],mat:THREE.Material,parent:THREE.Object3D=room)=>propPart(parent,size,at,mat);
 const floorShape=new THREE.Shape();floorShape.moveTo(-12,4.6);floorShape.lineTo(12,4.6);floorShape.lineTo(12,-16.2);floorShape.lineTo(-12,-16.2);floorShape.closePath();
 const pit=new THREE.Path();pit.moveTo(5.65,-11);pit.lineTo(5.65,-16.1);pit.lineTo(11.85,-16.1);pit.lineTo(11.85,-11);pit.closePath();floorShape.holes.push(pit);
 const slab=new THREE.Mesh(new THREE.ShapeGeometry(floorShape),garageConcrete());slab.rotation.x=-Math.PI/2;slab.receiveShadow=true;room.add(slab);
 box([24,.24,.15],[0,-.12,16.22],trim);
 const lighting=createGarageLighting(room);
 const lit=standard('#ffe4b8',.7,'#ffcd85');lit.emissiveIntensity=.45;
 function label(text:string,width:number,height:number,color='#eee1c2'){
  const c=document.createElement('canvas');c.width=768;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#111728';ctx.fillRect(0,0,768,96);ctx.fillStyle=color;ctx.font='bold 44px monospace';ctx.textAlign='center';ctx.textBaseline='middle';if(ctx.measureText(text).width>730)ctx.font=`bold ${Math.floor(44*730/ctx.measureText(text).width)}px monospace`;ctx.fillText(text,384,49);
  const texture=new THREE.CanvasTexture(c);texture.magFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));
 }
 const sign=label('FLUID GARAGE',3.6,.42,'#ee95ed');sign.position.set(0,3.22,-4.02);room.add(sign);
 const windows=createGarageWindows(room,windowMaterial,skyMaterial,3.598,cloudMaterial);
 const wallFixtures=new THREE.Group();room.add(wallFixtures);
 for(const x of [-6.25,0,6.25])box([.65,.045,.12],[x,2.96,-4.23],lit,wallFixtures);
 // Matching wall-mounted lifts connect the two floors.
 const upperLift=createElevator(factory,FACTORY_ELEVATOR.x,0,1.65,'01');
 const lowerLift=createElevator(room,GARAGE_ELEVATOR.x,0,1.65,'G');
 lowerLift.callPoint.y+=LEVEL;
 // A separate vehicle ramp occupies the right wall, away from the passenger lift.
 const rampMaterial=standard('#454958'), rampEdge=standard('#d2b574');
 const rampNear=5.2,rampFar=-4.1,rampRise=1.25,rampLength=rampNear-rampFar;
 const rampShape=new THREE.Shape();rampShape.moveTo(rampFar,0);rampShape.lineTo(rampNear,0);rampShape.lineTo(rampFar,rampRise);rampShape.closePath();
 const rampGeo=new THREE.ExtrudeGeometry(rampShape,{depth:2.12,bevelEnabled:false});rampGeo.rotateY(-Math.PI/2);rampGeo.translate(11.9,0,0);
 const ramp=new THREE.Mesh(rampGeo,rampMaterial);ramp.receiveShadow=true;room.add(ramp);
 const slope=Math.atan2(rampRise,rampLength);
 for(const x of [9.79,11.84]){
  const curb=box([.14,.22,Math.hypot(rampLength,rampRise)],[x,rampRise/2+.10,(rampNear+rampFar)/2],trim);curb.rotation.x=slope;
  const stripe=box([.055,.009,Math.hypot(rampLength-.18,rampRise)],[x+(x<10?.11:-.11),rampRise/2+.019,(rampNear+rampFar)/2],rampEdge);stripe.rotation.x=slope;
 }
 box([2.17,1.67,.075],[10.85,rampRise+.835,-4.18],dark);
 for(const x of [9.67,12.03])box([.19,2.9,.3],[x,1.45,-4.04],trim);
 box([2.52,.18,.34],[10.85,2.91,-4.03],trim);
 box([.73,.035,.15],[10.85,2.64,-3.89],lit,wallFixtures);
 const rampSign=label('EXIT',.95,.23,'#a9cdbd');rampSign.position.set(10.85,3.14,-3.97);room.add(rampSign);
 const cars=new Map<string,THREE.Group>();
 const carAnimation=createGarageCarAnimation(cars);
 const miniWork=createMiniWorkstation(room,cars);
 const ids=['porsche','mini','delorean','f1'];const names=['porsche','mini cooper','delorean','f1'];
 for(const [i,id] of ids.entries()){
  const bay=GARAGE_CAR_BAYS[id as GarageCarId],x=bay.x;
  for(const side of [-1,1]){const line=box([.04,.015,3.1],[x+side*1.15,.012,.05],paint);line.rotation.y=-.52;}
  void new GLTFLoader().loadAsync(`/prototype25d/garage/${id}.glb`).then(g=>{const root=new THREE.Group();root.name=id;root.add(g.scene);root.position.set(x,.025,bay.z);root.rotation.y=GARAGE_CAR_YAW;root.scale.setScalar(GARAGE_CAR_SCALE);root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});room.add(root);cars.set(id,root);contactShadow(root,{width:1.25,depth:2.35,floorY:-.014,spread:.25,opacity:.35});}).catch(()=>{status.textContent=`${names[i]} could not load · refresh to retry`;});
 }
 const furnishings=furnishGarage(room);
 wallFixtures.add(furnishings.wallFixtures);
 const lightSwitches:SceneLightSwitch[]=[...furnishings.lightSwitches,{id:'garage-wall-lights',label:'Garage wall lights',kind:'light',target:wallFixtures.children[1],hitTargets:[wallFixtures],isOn:lighting.isInteriorOn,setOn(on){lighting.setInteriorOn(on);furnishings.setWallLightsOn(on);lit.emissiveIntensity=on?.45:0;lit.color.set(on?'#ffe4b8':'#736c60');}}];
 const down=document.createElement('button');down.className='garage-elevator-call';down.type='button';down.textContent='↓ G';down.setAttribute('aria-label','Take elevator to the garage');document.body.append(down);
 const nav=document.createElement('div');nav.className='garage-nav pixel-island';nav.hidden=true;nav.innerHTML='<button type="button" aria-label="Take elevator to the factory">↑ factory</button><span>the garage</span><button type="button" aria-label="Work in the garage">work here</button><button type="button" aria-label="Show garage cars" aria-expanded="false">cars</button>';document.body.append(nav);
 const status=document.createElement('p');status.className='garage-status';status.hidden=true;document.body.append(status);
 const collection=document.createElement('div');collection.className='garage-collection pixel-island';collection.hidden=true;document.body.append(collection);
 let selectedCar:GarageCarId='mini',showCars=false,showingVisit=false;
 let carAction:(car:GarageCarId)=>{message:string;sessionId?:string}=()=>({message:'Choose one of your idle agents in agent controls.'});
 let pendingCar:{id:string;at:number}|undefined;
 function chooseCar(id:GarageCarId){selectedCar=id;status.hidden=false;status.textContent=names[ids.indexOf(id)];collection.querySelectorAll<HTMLButtonElement>('button[data-car]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.car===id)));}
 const carsToggle=nav.querySelector<HTMLButtonElement>('[aria-label="Show garage cars"]')!;carsToggle.onclick=()=>{showCars=!showCars;collection.hidden=!showCars;carsToggle.setAttribute('aria-expanded',String(showCars));if(showCars)chooseCar(selectedCar);else status.hidden=true;};for(const [i,id] of ids.entries()){const button=document.createElement('button');button.textContent=names[i];button.dataset.car=id;button.onclick=()=>chooseCar(id as GarageCarId);collection.append(button);}
 const rev=document.createElement('button');rev.type='button';rev.className='garage-car-rev';rev.textContent='get in + rev';collection.append(rev);
 rev.onclick=()=>{if(pendingCar||!available)return;const result=carAction(selectedCar);status.hidden=false;status.textContent=result.message;pendingCar=result.sessionId?{id:result.sessionId,at:performance.now()}:undefined;rev.disabled=!!pendingCar;};
 const stopCarMessages=onFactoryMessage(message=>{if(message.type==='garage_car_result'&&message.sessionId===pendingCar?.id){pendingCar=undefined;rev.disabled=false;status.hidden=false;status.textContent=message.success?'your agent is heading to the car · sound on to hear it':message.error??'That car is unavailable right now.';}});
 const transit=document.createElement('div');transit.className='garage-transit';transit.hidden=true;
 const readout=document.createElement('span');readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');transit.append(readout);document.body.append(transit);
 let open=false,available=true,trip:undefined|{from:boolean;to:boolean;start:number;passenger:boolean};
 let walkingAgent:WorldAgent|undefined,walkingNow=0;
 let visibleCamera:THREE.Camera=home;
 function visit(next:boolean,force=false){
  if(floorPreview!==undefined)return;
  if(trip||next===open||(!available&&!force))return;
  const ride=walkingAgent?.manualControl?.elevatorTrip;
  const passenger=!!ride&&(factoryRoomAt(fromFactoryWorld(ride.arrival))==='garage')===next;
  trip={from:open,to:next,start:performance.now()-(passenger?Math.max(0,walkingNow-ride!.startedAt):0),passenger};
  nav.hidden=collection.hidden=status.hidden=down.hidden=true;transit.hidden=false;transit.style.opacity='0';
  readout.textContent=next?'01 ↓ G':'G ↑ 01';document.body.classList.add('garage-travelling');
  transit.classList.toggle('is-reduced',matchMedia('(prefers-reduced-motion: reduce)').matches);
 }
 down.onclick=()=>visit(!open);nav.querySelector('button')!.onclick=()=>visit(false);
 const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open&&!trip){e.preventDefault();visit(false);}};document.addEventListener('keydown',escape);
 const ray=new THREE.Raycaster();const select=(e:PointerEvent)=>{
  if(trip||!available)return;
  const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),visibleCamera);
  if(ray.intersectObject(open?lowerLift.root:upperLift.root,true).length){visit(!open);return;}
  if(!open)return;
  for(const [id,car] of cars)if(ray.intersectObject(car,true).length){showCars=true;collection.hidden=false;carsToggle.setAttribute('aria-expanded','true');chooseCar(id as GarageCarId);break;}
 };canvas.addEventListener('pointerup',select);
 return {scene,camera,carAnimation,miniWork,lighting,lightSwitches,upperFloorOffset:()=>physicalTrip?upperFloorLift(floorProgress):0,setCarAction(action:typeof carAction){carAction=action;},visit:(next:boolean)=>visit(next,true),setWorkAction(action:()=>void){nav.querySelector<HTMLButtonElement>('[aria-label="Work in the garage"]')!.onclick=action;},setStationFeedback(states:Map<string,{active:boolean;color:string;heat:number}>){furnishings.workScreens.forEach((material,i)=>{const state=states.get(`garage-${i}`);material.emissive.set(state?.active?state.color:'#11352f');material.emissiveIntensity=state?.active ? .8+(state.heat??0)*.15 : .2;});},isActive:()=>open,isTransitioning:()=>!!trip||floorPreview!==undefined,isCrossSection:()=>physicalTrip&&floorProgress>0&&floorProgress<1,
 update(now:number,canOpen:boolean,projectionCamera:THREE.Camera=home,controlledAgent?:WorldAgent,serverNow=Date.now()){
  available=canOpen;visibleCamera=projectionCamera;walkingAgent=controlledAgent;walkingNow=serverNow;
  if(pendingCar&&now-pendingCar.at>8000){pendingCar=undefined;rev.disabled=false;status.textContent='No reply yet. Check the factory connection and try again.';}
  const carPhase=(selectedCar==='mini'?miniWork.phase():undefined)??carAnimation.visits.get(selectedCar);
  if(showCars&&carPhase){const message=`${names[ids.indexOf(selectedCar)]} · ${carPhase}`;if(status.textContent!==message)status.textContent=message;status.hidden=!open||!available;showingVisit=true;}
  else if(showingVisit){status.textContent=`${names[ids.indexOf(selectedCar)]} · ready`;showingVisit=false;}
  physicalTrip=false;floorProgress=Number(open);
  if(trip){
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const state=elevatorTrip(now-trip.start,trip.from,trip.to,reduced,trip.passenger);
   open=state.garage;floorProgress=state.garage01;physicalTrip=!reduced&&!state.done;transit.style.opacity=String(state.veil);
   transit.classList.toggle('is-reduced',reduced);
   upperLift.update(open?0:state.door,true);lowerLift.update(open?state.door:0,true);
   document.body.classList.toggle('garage-open',open);
   if(state.done){trip=undefined;transit.hidden=true;document.body.classList.remove('garage-travelling');nav.hidden=!open;collection.hidden=!open||!showCars;down.hidden=!available;if(walkingAgent?.manualControl)down.blur();else down.focus();}
  }else{
   const ride=walkingAgent?.manualControl?.elevatorTrip;
   if(ride){
    const toGarage=factoryRoomAt(fromFactoryWorld(ride.arrival))==='garage';
    const state=elevatorTrip(walkingNow-ride.startedAt,!toGarage,toGarage);
    upperLift.update(state.garage?0:state.door,true);lowerLift.update(state.garage?state.door:0,true);
   }else{upperLift.update(elevatorApproachOpenness(walkingAgent,'factory'));lowerLift.update(elevatorApproachOpenness(walkingAgent,'garage'));}
  }
  if(floorPreview!==undefined){physicalTrip=true;floorProgress=floorPreview;open=floorPreview>=.5;document.body.classList.toggle('garage-open',open);}
  scene.position.x=physicalTrip?GARAGE_SECTION_X:0;
  floorSection.root.visible=physicalTrip&&floorProgress>0&&floorProgress<1;
  floorSection.root.scale.y=1+(physicalTrip?upperFloorLift(floorProgress):0)/8.4;
  down.hidden=!available||!!trip;
  nav.hidden=!open||!!trip||!available;collection.hidden=!open||!!trip||!available||!showCars;if(!available)status.hidden=true;
  if(floorPreview!==undefined)down.hidden=nav.hidden=collection.hidden=true;
  const floorLabel=open?'↑ 01':'↓ G';
  if(down.dataset.label!==floorLabel){down.textContent=floorLabel;down.dataset.label=floorLabel;down.setAttribute('aria-label',open?'Take elevator to the factory':'Take elevator to the garage');}
  floorTravelCamera(camera,home,floorProgress,physicalTrip);
  canvas.dataset.floorProgress=floorProgress.toFixed(3);
  const rect=canvas.getBoundingClientRect();const point=(open?lowerLift.callPoint:upperLift.callPoint).clone().project(projectionCamera);
  down.style.left=`${rect.left+Math.max(8,Math.min(canvas.clientWidth-52,(point.x+1)*canvas.clientWidth/2-22))}px`;down.style.top=`${rect.top+Math.max(8,Math.min(canvas.clientHeight-52,(1-point.y)*canvas.clientHeight/2-22))}px`;
 if(open)furnishings.update(now/1000,matchMedia('(prefers-reduced-motion: reduce)').matches);
 },dispose(){furnishings.dispose();lit.dispose();floorSection.dispose();lighting.dispose();windows.dispose();miniWork.dispose();stopCarMessages();document.body.classList.remove('garage-open','garage-travelling');upperLift.root.removeFromParent();transit.remove();down.remove();nav.remove();status.remove();collection.remove();document.removeEventListener('keydown',escape);canvas.removeEventListener('pointerup',select);}};
}
