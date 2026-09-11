import * as THREE from 'three';
import {ELEVATOR_BODY} from '@shared/factory25d-layout';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';

export const ELEVATOR_WIDTH = ELEVATOR_BODY.width;

/** Shallow wall assembly, with door panels masked by their pocket opening. */
export function createElevator(parent: THREE.Object3D, x: number, floorY: number, width: number, floor: '01' | 'G') {
  const heightScale=1.82/3.16;
  const root = new THREE.Group(); root.scale.y=heightScale; root.position.set(x, floorY, -4.28); parent.add(root);
  const navy = standard('#252b44'), frame = standard('#465168'), recess = standard('#111929');
  const brass = standard('#ac956e', .7), cyan = standard('#69cbbf', .7, '#247f77');
  const warm = standard('#eed0a2', .8, '#d4a66f'); warm.emissiveIntensity = .55;
  const add = (size: [number,number,number], at: [number,number,number], material: THREE.Material, group: THREE.Object3D = root) => propPart(group,size,at,material);
  const opening = width * .65, panelWidth = opening / 2;
  add([width,3.16,.22],[0,1.58,-.08],navy);
  add([opening+.09,2.43,.035],[0,1.3,.05],recess);
  add([opening-.12,2.2,.025],[0,1.28,.08],standard('#4a4148',1,'#171116'));
  add([opening-.13,.025,.34],[0,.115,.19],standard('#746653'));
  for(const side of [-1,1]) {
    add([.11,2.56,.24],[side*(opening/2+.085),1.35,.16],frame);
    add([.035,2.29,.035],[side*(opening/2-.025),1.29,.10],brass);
  }
  add([opening+.27,.12,.3],[0,2.64,.17],frame);
  add([opening-.12,.035,.1],[0,2.47,.12],warm);
  add([opening+.25,.045,.53],[0,.037,.2],frame);
  add([opening-.14,.009,.06],[0,.064,.4],warm);
  const metal = standard('#697486',.68,'#182130'); metal.emissiveIntensity=.42; metal.metalness=.22;
  const grain = document.createElement('canvas'); grain.width=64; grain.height=128;
  const context=grain.getContext('2d')!; context.fillStyle='#d8dce2';context.fillRect(0,0,64,128);
  for(let i=0;i<200;i++){context.fillStyle=`rgba(55,63,83,${.025+(i%7)*.006})`;context.fillRect((i*37)%64,0,1,128);}
  const texture=new THREE.CanvasTexture(grain);texture.colorSpace=THREE.SRGBColorSpace;metal.map=texture;
  const panels:THREE.Group[]=[];
  for(const side of [-1,1]) {
    const panel=new THREE.Group();root.add(panel);panels.push(panel);
    add([panelWidth-.008,2.29,.06],[0,1.29,.20],metal,panel);
    add([.018,2.22,.012],[-side*(panelWidth/2-.02),1.29,.237],frame,panel);
    add([.035,.28,.019],[-side*(panelWidth/2-.09),1.3,.245],frame,panel);
  }
  function textSign(text:string,w:number,h:number,color:string) {
    const c=document.createElement('canvas');c.width=384;c.height=64;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#0e1626';ctx.fillRect(0,0,384,64);ctx.fillStyle=color;ctx.font='32px "Geist Pixel",monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,34);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;
    return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map}));
  }
  const header=textSign(floor,.3,.25,'#88dbd0');header.position.set(0,2.9,.08);root.add(header);
  const panelX=opening/2+(width-opening)/4+.045;
  add([.24,.57,.085],[panelX,1.35,.11],recess);
  const number=textSign(floor,.15,.2,'#71dfd1');number.position.set(panelX,1.48,.16);root.add(number);
  const call=add([.055,.055,.023],[panelX,1.19,.165],cyan);
  const light=new THREE.PointLight('#ffcf97',1.1,2.4,2);light.position.set(0,2.28,.16);root.add(light);
  contactShadow(parent,{x,z:-3.88,floorY,width,depth:.42,spread:.18,opacity:.25});
  function update(openness:number,travel=false) {
    for(let i=0;i<2;i++){const side=i===0?-1:1;panels[i].position.x=side*(panelWidth/2+openness*panelWidth/2);panels[i].scale.x=Math.max(.001,1-openness);panels[i].visible=openness<.999;}
    call.material=travel?warm:cyan;light.intensity=.9+openness*.6;
  }
  update(0);
  return {root, update, callPoint:new THREE.Vector3(x+panelX,floorY+1.2*heightScale,-3.97)};
}
