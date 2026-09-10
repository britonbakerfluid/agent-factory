import * as THREE from 'three';
import type { RpsChoice } from '@shared/types';
import type { AgentEffect } from './factory25dEffectsState';
import { rpsPhase, smoothEffect } from './factory25dEffectsState';

type Point = { x:number;y:number;z:number };
/** Lit, sculpted game objects. All motion is derived from the shared round clock. */
export function createRpsObjects() {
  const geometries:THREE.BufferGeometry[]=[], materials:THREE.Material[]=[];
  const geometry=<T extends THREE.BufferGeometry>(value:T)=>{geometries.push(value);return value;};
  const material=(color:string,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness:metalness?.38:.82,metalness,flatShading:true,side:THREE.DoubleSide});materials.push(m);return m;};
  const stone=material('#899298'),cream=material('#fff1ca'),steel=material('#c6d5da',.65),red=material('#d97846'),blue=material('#73a3b4');
  const rockShape=geometry(new THREE.IcosahedronGeometry(.19,1));
  const ringShape=geometry(new THREE.TorusGeometry(.075,.024,6,12));
  const pinShape=geometry(new THREE.CylinderGeometry(.027,.027,.05,10));
  const blade=new THREE.Shape();blade.moveTo(-.032,-.04);blade.lineTo(.045,-.035);blade.lineTo(.022,.29);blade.quadraticCurveTo(-.015,.34,-.028,.27);blade.closePath();
  const bladeShape=geometry(new THREE.ExtrudeGeometry(blade,{depth:.018,bevelEnabled:true,bevelThickness:.007,bevelSize:.008,bevelSegments:1,steps:1}));
  const lineShape=geometry(new THREE.BoxGeometry(.25,.007,.003));
  function mesh(parent:THREE.Object3D,g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0){const obj=new THREE.Mesh(g,m);obj.position.set(x,y,z);parent.add(obj);return obj;}
  function create(){
    const root=new THREE.Group(),pivot=new THREE.Group();root.add(pivot);
    const rock=new THREE.Group(),paper=new THREE.Group(),scissors=new THREE.Group();pivot.add(rock,paper,scissors);
    mesh(rock,rockShape,stone).scale.set(1.12,.84,.92);rock.rotation.set(.2,.35,-.15);
    const sheets=[new THREE.PlaneGeometry(.2,.46,8,16),new THREE.PlaneGeometry(.2,.46,8,16)];
    const halves=sheets.map((g,i)=>mesh(paper,g,cream,i===0?-.1:.1));
    const writing=new THREE.Group();paper.add(writing);
    for(let i=0;i<4;i++)mesh(writing,lineShape,blue,0,.11-i*.065,.006);
    const arms=[new THREE.Group(),new THREE.Group()];
    arms.forEach((arm,i)=>{scissors.add(arm);mesh(arm,bladeShape,steel,0,0,i*.028);mesh(arm,ringShape,red,0,-.135,i*.028);});
    const pin=mesh(scissors,pinShape,steel,0,0,.035);pin.rotation.x=Math.PI/2;
    scissors.rotation.y=-.12;
    let lastBend=-1;
    function update(effect:AgentEffect,now:number,opponent:Point|undefined,anchor:Point,reduced:boolean){
      const age=now-effect.startedAt,phase=rpsPhase(effect,now),choice: RpsChoice=age<1660?(phase as RpsChoice):effect.choice??'rock';
      rock.visible=choice==='rock';paper.visible=choice==='paper';scissors.visible=choice==='scissors';
      root.position.set(0,1.17,.08);root.rotation.set(0,0,0);root.scale.setScalar(1);
      const action=smoothEffect((age-2320)/1000),strike=smoothEffect((age-2520)/260);
      // Swing a short invisible forearm about an elbow below the object: three downbeats.
      const beat=age<1660?Math.sin(Math.max(0,age)/1660*Math.PI*6):0;
      pivot.position.set(0,.17+(reduced?0:beat*.10),0);
      pivot.rotation.set(reduced?0:beat*.3,0,reduced?0:beat*-.14);
      rock.position.set(0,0,0);rock.scale.set(1,1,1);paper.position.set(0,0,0);paper.rotation.set(.06,-.12,-.12);
      writing.visible=true;pin.visible=true;
      arms.forEach((arm,i)=>{arm.position.set(0,0,0);arm.rotation.set(0,0,(i===0?1:-1)*(.32+(choice==='scissors'&&age<1660&&!reduced?beat*.09:0)));});
      // Each winner travels toward its opponent, so the result happens between the actual players.
      if(opponent&&effect.outcome==='win'&&age>=2320&&!reduced){
        const approach=smoothEffect((age-2320)/350);
        root.position.x+=(opponent.x-anchor.x)*approach;
        root.position.z+=(opponent.z-anchor.z)*approach;
        root.position.y+=(opponent.y-anchor.y)*approach;
        if(choice==='rock')root.position.y+=Math.sin(smoothEffect((age-2320)/550)*Math.PI)*.38-strike*.08;
        if(choice==='scissors')arms.forEach((arm,i)=>arm.rotation.z=(i===0?1:-1)*(.1+Math.abs(Math.sin(action*Math.PI*4))*.38));
      }
      const crushed=choice==='scissors'&&effect.outcome==='lose'&&age>=2780;
      if(crushed&&!reduced){
        pin.visible=false;const fall=smoothEffect((age-2780)/750);
        arms.forEach((arm,i)=>{const sign=i===0?-1:1;arm.position.set(sign*fall*.26,-fall*.35,fall*.08);arm.rotation.z+=sign*fall*1.5;});
      }
      const cut=choice==='paper'&&effect.outcome==='lose'&&age>=2660;
      const wrap=choice==='paper'&&effect.outcome==='win'&&age>=2520;
      if(cut||wrap)writing.visible=false;
      const amount=reduced?0:wrap?smoothEffect((age-2520)/650):0;
      sheets.forEach((g,half)=>{
        const positions=g.attributes.position;
        if(amount!==lastBend){
        for(let i=0;i<positions.count;i++){
          const column=i%9,row=Math.floor(i/9),x=(column/8-.5)*.2,y=(.5-row/16)*.46;
          const wholeX=x+(half===0?-.1:.1),theta=wholeX/.4*Math.PI*2*amount;
          positions.setXYZ(i,THREE.MathUtils.lerp(wholeX,Math.sin(theta)*.205,amount)-(half===0?-.1:.1),y,amount*(Math.cos(theta)*.205));
        }
        positions.needsUpdate=true;g.computeVertexNormals();
        }
        const split=cut&&!reduced?smoothEffect((age-2660)/800):0;
        halves[half].position.set((half===0?-1:1)*(.1+split*.18),-split*.22,0);
        halves[half].rotation.z=(half===0?-1:1)*split*.5;
      });
      lastBend=amount;
      // Reduced motion keeps the three-dimensional choices and readable result without strikes or debris.
    }
    return {root,update,dispose(){root.removeFromParent();sheets.forEach(g=>g.dispose());}};
  }
  return {create,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
