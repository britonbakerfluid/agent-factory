import { createWindowTraffic } from './racing/window-traffic';
import {createDeparture} from './racing/departure';
import { MountainGame } from './racing/game';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { createIndoorPlants } from './reference/factory25dPlants';
import { standard, propPart } from './reference/factory25dProps';
import { contactShadow } from './reference/factory25dContactShadows';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('garage');
const renderer = new THREE.WebGLRenderer({canvas,antialias:false});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.setPixelRatio(1);
const scene=new THREE.Scene();scene.background=new THREE.Color('#090c18');
const camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100);
camera.position.set(1.8,11.8,18.5);
const controls=new OrbitControls(camera,canvas);
controls.target.set(0,.4,0);controls.enableDamping=true;controls.dampingFactor=.12;
controls.minPolarAngle=.22;controls.maxPolarAngle=Math.PI*.46;
controls.minZoom=.55;controls.maxZoom=4;controls.enablePan=false;controls.update();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const room=new THREE.Group();scene.add(room);
const wall=standard('#30384d',.99),edge=standard('#48536a'),ink=standard('#202534'),wood=standard('#9b7951');
const floorMat=standard('#242a40',.96,'#080b16');
const floor=propPart(room,[14,.20,12],[0,-.10,0],floorMat);
floor.receiveShadow=true;
propPart(room,[14,.15,.12],[0,.025,6],edge);
for(const x of [-7,7])propPart(room,[.12,.43,12],[x,.215,0],wall);
// Fine concrete seams and painted bays leave a continuous central driving aisle.
for(let x=-6;x<7;x+=2)propPart(room,[.012,.004,12],[x,.004,0],standard('#30364b'));
for(let z=-4;z<6;z+=2)propPart(room,[14,.004,.012],[0,.004,z],standard('#30364b'));
const bay=new THREE.MeshStandardMaterial({color:'#41485e',roughness:1});
const paintLine=standard('#9e977e',1);
for(const [x,z] of [[-3.2,1.65],[3.15,1.65],[-3.2,-2.15],[3.15,-2.15]]){
  propPart(room,[3.35,.012,3.35],[x,.006,z],bay);
  for(const side of [-1,1]){
    propPart(room,[.026,.006,2.7],[x+side*1.44,.017,z],paintLine);
    propPart(room,[.28,.006,.028],[x+side*1.30,.017,z+1.36],paintLine);
  }
  propPart(room,[.62,.07,.12],[x,.05,z-1.32],ink);
}
for(let z=-3.3;z<5.5;z+=1.05)propPart(room,[.038,.006,.43],[0,.01,z],standard('#776f61'));

// Factory shell: muted trim, practical workbench, broad windows and a future exit.
propPart(room,[.35,3.3,.15],[-6.825,1.65,-6],wall);
propPart(room,[3.85,3.3,.15],[-1.925,1.65,-6],wall);
propPart(room,[2.8,.5,.15],[-5.25,3.05,-6],wall);
propPart(room,[2.8,.15,5],[-5.25,-.08,-8],floorMat);
propPart(room,[14,.16,.24],[0,3.38,-6],edge);
propPart(room,[14,.09,.34],[0,.045,-5.93],ink);
const landscapeScene=new THREE.Scene();landscapeScene.background=new THREE.Color('#637da6');
const landscapeTarget=new THREE.WebGLRenderTarget(768,360,{minFilter:THREE.LinearFilter,magFilter:THREE.NearestFilter});
const landscapeCamera=new THREE.OrthographicCamera(-11,11,5.15,-5.15,.1,70);
landscapeCamera.position.set(0,4.5,12);landscapeCamera.lookAt(0,1.1,-5);
const landscapeAmbient=new THREE.HemisphereLight('#b6c9e1','#5b604e',3.1);landscapeScene.add(landscapeAmbient);
const landscapeSun=new THREE.DirectionalLight('#fff0d6',2.0);landscapeSun.position.set(-5,10,4);landscapeScene.add(landscapeSun);
const windowView=new THREE.Mesh(new THREE.PlaneGeometry(7.0,3.22),new THREE.MeshBasicMaterial({map:landscapeTarget.texture}));
windowView.position.set(3.5,1.66,-6.075);room.add(windowView);
function renderLandscape(){renderer.setRenderTarget(landscapeTarget);renderer.render(landscapeScene,landscapeCamera);renderer.setRenderTarget(null);}
renderLandscape();
for(const x of [0,1.75,3.5,5.25,7])propPart(room,[.09,3.3,.14],[x,1.65,-6],ink);
propPart(room,[7,.09,.14],[3.5,.56,-6],edge);
propPart(room,[7,.07,.14],[3.5,2.65,-6],edge);
// The exact Blender terrain asset from the factory, framed behind the garage glass.
const loader=new GLTFLoader();
loader.load(import.meta.env.BASE_URL+'models/utah-mountains.glb',g=>{
  g.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=false;o.receiveShadow=true;}});
  landscapeScene.add(g.scene);renderLandscape();
},undefined,()=>{/* A quiet sky remains if this optional reference cannot load. */});

const shutter=new THREE.Group();room.add(shutter);
propPart(shutter,[2.25,2.65,.10],[-5.25,1.33,-5.88],ink);
for(let y=.14;y<2.63;y+=.20)propPart(shutter,[2.05,.178,.07],[-5.25,y,-5.81],standard('#41485a'));
for(const x of [-6.4,-4.1])propPart(room,[.10,2.8,.24],[x,1.4,-5.77],edge);
propPart(room,[2.4,.14,.24],[-5.25,2.84,-5.77],edge);
propPart(shutter,[.4,.055,.035],[-5.25,.75,-5.76],dark('#a8a59b'));

function dark(c:string){return standard(c,.94);}
function label(text:string,w:number,h:number,color='#d7cfb7',bg='#242a39'){
  const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*h/w);
  const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle=color;ctx.font=`${Math.floor(c.height*.52)}px GeistPixel, monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,c.height/2);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;
  return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:1}));
}
await document.fonts.load('14px GeistPixel');
const exitLabel=label('TEST LOOP',1.24,.19);exitLabel.position.set(-5.25,3.02,-5.75);room.add(exitLabel);
const wallSign=label('FLUID MOTOR CLUB',3.05,.29);wallSign.position.set(-1.75,2.9,-5.80);room.add(wallSign);

const bench=new THREE.Group();bench.position.set(-1.9,0,-5.3);room.add(bench);
propPart(bench,[2.64,.14,.64],[0,.86,0],wood);
for(const x of [-1.14,1.14])propPart(bench,[.075,.8,.46],[x,.4,0],ink);
propPart(bench,[2.34,.055,.53],[0,.25,0],edge);
const toolboxMat=standard('#a44c49');
propPart(bench,[.67,.40,.37],[-.61,.51,0],toolboxMat);
for(const y of [.39,.50,.61])propPart(bench,[.43,.018,.018],[-.61,y,.193],standard('#b6b1a4'));
for(const x of [.10,.35,.63])propPart(bench,[.13,.20,.15],[x,1.03,0],standard(x===.35?'#b99b63':'#596878'));
// Whiteboard proportions, wheeled feet and tiny physical accessories echo the main room.
const board=new THREE.Group();board.position.set(-1.65,1.13,-5.72);room.add(board);
propPart(board,[2.02,1.2,.065],[0,.52,0],edge);
propPart(board,[1.88,1.06,.017],[0,.52,.044],standard('#b8c0c7'));
propPart(board,[2.08,.058,.14],[0,-.07,.035],edge);
const drawing=document.createElement('canvas');drawing.width=480;drawing.height=256;
const ctx=drawing.getContext('2d')!;ctx.clearRect(0,0,480,256);ctx.strokeStyle='#3b6270';ctx.lineWidth=3;
ctx.beginPath();ctx.moveTo(55,174);ctx.bezierCurveTo(19,136,59,68,145,75);ctx.bezierCurveTo(219,79,172,131,256,133);ctx.bezierCurveTo(336,136,335,45,402,68);ctx.bezierCurveTo(465,90,421,212,330,207);ctx.bezierCurveTo(225,201,114,230,55,174);ctx.stroke();
ctx.fillStyle='#4a5865';ctx.font='18px GeistPixel';ctx.fillText('someday: mountain laps',30,31);ctx.fillRect(118,197,4,17);ctx.fillRect(125,200,4,17);
const drawingTexture=new THREE.CanvasTexture(drawing);drawingTexture.colorSpace=THREE.SRGBColorSpace;drawingTexture.magFilter=THREE.NearestFilter;
const drawingMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.81,.98),new THREE.MeshStandardMaterial({map:drawingTexture,transparent:true,roughness:1}));
drawingMesh.position.set(0,.52,.056);board.add(drawingMesh);
propPart(board,[.17,.025,.035],[.53,-.025,.09],standard('#386385'));
propPart(board,[.16,.045,.07],[-.64,-.017,.09],ink);

const plants=createIndoorPlants(room);
plants.plant('bird',6.2,-5.05,1.35,.8);
plants.plant('rubber',.45,-5.2,1.1,1.5);
plants.plant('snake',-6.35,4.9,1.05,.4);
plants.plant('palm',6.1,4.6,1.2,1.1);
plants.plant('bonsai',-.88,-5.28,.60,2.2,.94);
const shelf=plants.shelf(6.35,-3.15);shelf.rotation.y=-Math.PI/2;
// Spare wheels and compact mechanic's stool.
for(let i=0;i<3;i++){
  const tire=new THREE.Mesh(new THREE.TorusGeometry(.27,.10,6,16),standard('#191c29'));
  tire.rotation.x=Math.PI/2;tire.position.set(-6.25,.10+i*.19,-3.5);tire.castShadow=true;room.add(tire);
}
const stool=new THREE.Group();stool.position.set(-.85,0,-4.4);room.add(stool);
propPart(stool,[.43,.10,.40],[0,.54,0],standard('#b47e52'));
for(const x of [-.15,.15])for(const z of [-.14,.14])propPart(stool,[.035,.5,.035],[x,.25,z],ink);
for(const [x,z] of [[-6.25,-3.5],[-.85,-4.4]])contactShadow(room,{x,z,width:.55,depth:.55,opacity:.35});
room.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry instanceof THREE.BoxGeometry&&o.geometry.parameters.height<.05&&o.position.y<.08){o.castShadow=false;o.receiveShadow=false;}});

const ambient=new THREE.HemisphereLight('#9bb6df','#363453',2.3);scene.add(ambient);
const sun=new THREE.DirectionalLight('#ffe0b3',1.7);sun.position.set(-5,9,-4);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:35});
sun.shadow.normalBias=.03;sun.shadow.bias=-.00015;scene.add(sun);
RectAreaLightUniformsLib.init();
const fill=new THREE.RectAreaLight('#b9c8ff',3,8,5);fill.position.set(2,7,3);fill.lookAt(0,0,0);scene.add(fill);
const workLight=new THREE.PointLight('#ffcc83',11,6,2);workLight.position.set(-2,2.6,-4.8);scene.add(workLight);
const glow=new THREE.Mesh(new THREE.BoxGeometry(1.8,.06,.06),new THREE.MeshBasicMaterial({color:'#f3d6a2'}));glow.position.set(-1.85,2.62,-5.7);room.add(glow);

const info={
  porsche:{name:'porsche',note:'round lights. wide hips. a proper little track coupe.',eyebrow:'01 / THE WEEKEND CAR',x:-3.2,z:1.65,angle:-.15},
  mini:{name:'mini cooper',note:'the small one with the white roof and a lot of character.',eyebrow:'02 / THE CITY CAR',x:3.15,z:-2.15,angle:.13},
  delorean:{name:'delorean',note:'gullwing doors, rear-deck gadgets, and one flux capacitor.',eyebrow:'03 / THE TIME MACHINE',x:-3.2,z:-2.15,angle:-.14},
  f1:{name:'f1',note:'open wheels, tiny cockpit, and far too much downforce.',eyebrow:'04 / THE RACE CAR',x:3.15,z:1.65,angle:.12},
};
type CarId=keyof typeof info;
type Car={root:THREE.Group;wheels:THREE.Object3D[];steering:THREE.Object3D[];doors:THREE.Object3D[];paint:THREE.MeshStandardMaterial[]};
const cars=new Map<CarId,Car>();
let current:CarId|'room'='room',doorTarget=0,doorValue=0,spin=false,evening=false,pixels=true;
const paintColors=['#e9dbb3','#769890','#6584ac','#bb684e'];let paintIndex=0;
const status=$('status');
const results=await Promise.allSettled((Object.keys(info) as CarId[]).map(async id=>{
  const g=await loader.loadAsync(import.meta.env.BASE_URL+'models/'+id+'.glb');
  const placement=new THREE.Group();placement.name=id+'_placement';placement.position.set(info[id].x,.025,info[id].z);placement.rotation.y=info[id].angle;
  const car:Car={root:placement,wheels:[],steering:[],doors:[],paint:[]};
  g.scene.traverse(o=>{
    if(o.userData.role==='wheel')car.wheels.push(o);
    if(o.userData.role==='steering'&&o.userData.axle==='front')car.steering.push(o);
    if(o.userData.role==='door')car.doors.push(o);
    if(o instanceof THREE.Mesh){
      o.castShadow=true;o.receiveShadow=true;
      for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){
        if(m.name.startsWith('Porsche')&&!car.paint.includes(m))car.paint.push(m);
        // Quiet material response matches the shared plant/furniture palette.
        m.envMapIntensity=.25;
      }
    }
  });
  placement.add(g.scene);scene.add(placement);cars.set(id,car);
  contactShadow(placement,{width:id==='f1'?1.2:.97,depth:id==='mini'?1.60:2.12,opacity:.52,spread:.25});
}));
const failed=results.filter(r=>r.status==='rejected').length;
status.textContent=failed?'Some cars could not load. Refresh to try again.':'';
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-car]'))if(b.dataset.car!=='room'&&!cars.has(b.dataset.car as CarId))b.disabled=true;

let game:MountainGame|undefined;
let transition:{start:number;from:THREE.Vector3;to:THREE.Vector3;fromTarget:THREE.Vector3;toTarget:THREE.Vector3;fromZoom:number;toZoom:number}|undefined;
function select(id:CarId|'room'){
  if(game && (game.mode!=='garage'||game.board))return;
  current=id;spin=false;$('wheels').setAttribute('aria-pressed','false');$('wheels').textContent='spin wheels';
  const target=id==='room'?new THREE.Vector3(0,.40,0):cars.get(id)!.root.position.clone().add(new THREE.Vector3(0,.42,0));
  const destination=id==='room'?new THREE.Vector3(1.8,11.8,18.5):target.clone().add(new THREE.Vector3(4.8,3.5,6.0));
  const zoom=id==='room'?1:innerWidth/innerHeight<.85?3.2:2.7;
  transition={start:performance.now(),from:camera.position.clone(),to:destination,fromTarget:controls.target.clone(),toTarget:target,fromZoom:camera.zoom,toZoom:zoom};
  controls.enabled=false;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-car]'))button.setAttribute('aria-pressed',String(button.dataset.car===id));
  $('car-name').textContent=id==='room'?'the garage.':info[id].name;
  $('car-note').textContent=id==='room'?'choose a car to get closer.':info[id].note;
  $('eyebrow').textContent=id==='room'?'THE COLLECTION':info[id].eyebrow;
  $('model-actions').hidden=id==='room';$('doors').hidden=id!=='delorean';$('paint').hidden=id!=='porsche';
}
document.querySelectorAll<HTMLButtonElement>('[data-car]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.car as CarId|'room')));
let pointerStart:{x:number;y:number}|undefined;
canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{
  if(game && (game.mode!=='garage'||game.board))return;
  if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
  pointerStart=undefined;
  const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects([...cars.values()].map(c=>c.root),true).find(h=>h.object instanceof THREE.Mesh&&!(h.object.material as THREE.Material).transparent);
  if(!hit)return;
  let o:THREE.Object3D|null=hit.object;
  while(o){const id=([...cars.entries()].find(([,c])=>c.root===o)||[])[0];if(id){select(id);break;}o=o.parent;}
});
$('doors').addEventListener('click',()=>{doorTarget=doorTarget?0:1;$('doors').textContent=doorTarget?'close gullwings':'open gullwings';$('doors').setAttribute('aria-pressed',String(!!doorTarget));});
$('wheels').addEventListener('click',()=>{spin=!spin;$('wheels').textContent=spin?'stop wheels':'spin wheels';$('wheels').setAttribute('aria-pressed',String(spin));});
$('paint').addEventListener('click',()=>{paintIndex=(paintIndex+1)%paintColors.length;cars.get('porsche')?.paint.forEach(m=>m.color.set(paintColors[paintIndex]));});
$('light').addEventListener('click',()=>{
  evening=!evening;$('light').setAttribute('aria-pressed',String(evening));$('light').textContent=evening?'daylight':'evening';
  ambient.intensity=evening?1.3:2.3;ambient.color.set(evening?'#9c9bcc':'#9bb6df');
  sun.intensity=evening?.35:1.7;sun.color.set(evening?'#ef976b':'#ffe0b3');fill.intensity=evening?2.5:3;
  landscapeScene.background=new THREE.Color(evening?'#3b456a':'#637da6');
  landscapeAmbient.intensity=evening?1.2:3.1;landscapeSun.intensity=evening?.35:2;renderLandscape();workLight.intensity=evening?20:11;
});
$('pixels').addEventListener('click',()=>{pixels=!pixels;$('pixels').textContent=pixels?'pixels on':'pixels off';$('pixels').setAttribute('aria-pressed',String(pixels));resize();});
addEventListener('keydown',e=>{if(e.key==='Escape'&&(!game||(game.mode==='garage'&&!game.board))){select('room');document.querySelector<HTMLButtonElement>('[data-car="room"]')!.focus();}});
controls.addEventListener('start',()=>{transition=undefined;controls.enabled=true;});
function resize(){
  const w=innerWidth,h=innerHeight,aspect=w/h;
  // Keep the full room contained at narrow aspect ratios.
  const halfHeight=Math.max(6.9,8.7/aspect);
  camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;
  camera.updateProjectionMatrix();
  const ratio=pixels?Math.min(1,1080/w):Math.min(devicePixelRatio,2);
  renderer.setSize(Math.floor(w*ratio),Math.floor(h*ratio),false);
}
addEventListener('resize',resize);resize();
let updateWindowTraffic:((dt:number,paused:boolean)=>void)|undefined;
let lastWindowFrame=-1;
const departure=createDeparture(scene,camera,controls.target,shutter);
let last=performance.now();
function frame(now:number){
  const rawDt=(now-last)/1000,dt=Math.min(.1,rawDt);last=now;
  if(game?.frame(rawDt,now)){requestAnimationFrame(frame);return;}
  departure.update(dt);
  if(transition){
    const t=reduced.matches?1:Math.min(1,(now-transition.start)/720);
    const e=t*t*t*(t*(t*6-15)+10);
    camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,e);
    camera.zoom=Math.exp(THREE.MathUtils.lerp(Math.log(transition.fromZoom),Math.log(transition.toZoom),e));camera.updateProjectionMatrix();
    if(t===1){transition=undefined;controls.enabled=true;}
  }
  doorValue=reduced.matches?doorTarget:THREE.MathUtils.damp(doorValue,doorTarget,7,dt);
  cars.get('delorean')?.doors.forEach(d=>{d.rotation.z=Number(d.userData.openAngle)*doorValue;});
  if(spin&&current!=='room'&&!document.hidden){
    cars.get(current)?.wheels.forEach(w=>{w.rotation.x-=dt*2.4;});
    cars.get(current)?.steering.forEach(w=>{w.rotation.y=Math.sin(now/1200)*.26;});
  }
  if(updateWindowTraffic){updateWindowTraffic(dt,reduced.matches||document.hidden);const windowFrame=Math.floor(now/1000*12);if(windowFrame!==lastWindowFrame){renderLandscape();lastWindowFrame=windowFrame;}}
  plants.update(now/1000,reduced.matches);controls.update();renderer.render(scene,camera);
  canvas.dataset.view=current;canvas.dataset.loaded=String(cars.size);canvas.dataset.doors=doorValue>.99?'open':doorValue<.01?'closed':'moving';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

game=new MountainGame({garageExterior:()=>{const exterior=new THREE.Group();exterior.add(room.clone(true));for(const car of cars.values())if(car.root.visible)exterior.add(car.root.clone(true));return exterior;},depart:async id=>{spin=false;doorTarget=0;await departure.start(cars.get(id)!.root);},restoreGarage:()=>departure.restore(),renderer,canvas,cars,selected:()=>current,setControls:enabled=>{controls.enabled=enabled;if(!enabled)transition=undefined;},boardCanvas:drawing,boardTexture:drawingTexture,boardObject:board,garageCamera:camera,addWindowRoad:(road,track)=>{landscapeScene.add(road);renderLandscape();void createWindowTraffic(landscapeScene,track).then(update=>{updateWindowTraffic=update;update(0,true);renderLandscape();}).catch(()=>{});}});

const factoryCar=new URLSearchParams(location.search).get('factoryCar');
if(factoryCar && ['mini','porsche','delorean','f1'].includes(factoryCar)) void game.start(factoryCar as CarId);
