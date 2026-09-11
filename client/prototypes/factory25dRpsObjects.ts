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
    let lastBend=-1,lastCrumple=-1;
    const swingAxis=new THREE.Vector3();
    function update(effect:AgentEffect,now:number,opponent:Point|undefined,anchor:Point,reduced:boolean){
      const age=now-effect.startedAt,phase=rpsPhase(effect,now),choice: RpsChoice=age<1660?(phase as RpsChoice):effect.choice??'rock';
      rock.visible=choice==='rock';paper.visible=choice==='paper';scissors.visible=choice==='scissors';
      root.position.set(0,1.17,.08);root.rotation.set(0,0,0);root.scale.setScalar(1);
      const strike=smoothEffect((age-2670)/180);
      // A fixed virtual elbow and rigid forearm create an arc, not a bob.
      // Both players use the same clock but point toward each other, so their
      // wind-ups lift away from the center in mirrored directions.
      const beat=age<1660&&!reduced?Math.pow(Math.sin(Math.max(0,age)/1660*Math.PI*3),2):0;
      const dx=opponent?opponent.x-anchor.x:1,dz=opponent?opponent.z-anchor.z:0;
      const length=Math.hypot(dx,dz),towardX=length>.001?dx/length:1,towardZ=length>.001?dz/length:0;
      const rest=1.05,angle=rest-beat*1.40,reach=.38;
      const away=(Math.sin(angle)-Math.sin(rest))*reach;
      pivot.position.set(towardX*away,.17+(Math.cos(angle)-Math.cos(rest))*reach,towardZ*away);
      swingAxis.set(-towardZ,0,towardX);
      if(beat===0)pivot.rotation.set(0,0,0);
      else pivot.quaternion.setFromAxisAngle(swingAxis,rest-angle);
      rock.position.set(0,0,0);rock.scale.set(1,1,1);paper.position.set(0,0,0);paper.rotation.set(0,0,0);
      writing.visible=true;pin.visible=true;scissors.rotation.set(0,0,0);
      arms.forEach((arm,i)=>{arm.position.set(0,0,0);arm.rotation.set(0,0,(i===0?1:-1)*(.32+(choice==='scissors'&&age<1660&&!reduced?beat*.09:0)));});
      // Both props meet at the shared midpoint before the winner makes contact.
      if(opponent&&effect.outcome!=='draw'&&age>=2320&&!reduced){
        const approach=smoothEffect((age-2320)/350);
        root.position.x+=(opponent.x-anchor.x)*.5*approach;
        root.position.z+=(opponent.z-anchor.z)*.5*approach;
        root.position.y+=(opponent.y-anchor.y)*.5*approach;
        // Clear the victim before contact: a rock lands on the blade tips,
        // paper approaches in front, and scissors follow the sheet's center seam.
        if(effect.outcome==='win'){
        if(choice==='rock')root.position.y+=approach*(.78-strike*.30);
        if(choice==='paper')root.position.z+=.255*approach*(1-smoothEffect((age-2670)/650));
        if(choice==='scissors'){
          const cutProgress=smoothEffect((age-2670)/650);
          root.position.y+=approach*(-.52+cutProgress*.76);
          root.position.z-=.023*approach;
          arms.forEach((arm,i)=>arm.rotation.z=(i===0?1:-1)*(.05+Math.abs(Math.sin(cutProgress*Math.PI*3))*.24));
        }
      }
      }
      const crushed=choice==='scissors'&&effect.outcome==='lose'&&age>=2850;
      if(crushed&&!reduced){
        pin.visible=false;const fall=smoothEffect((age-2850)/650);
        arms.forEach((arm,i)=>{const sign=i===0?-1:1;arm.position.set(sign*fall*.26,-fall*.35,fall*.08);arm.rotation.z+=sign*fall*1.5;});
      }
      const cut=choice==='paper'&&effect.outcome==='lose'&&age>=2720;
      const wrap=choice==='paper'&&effect.outcome==='win'&&age>=2670;
      if(cut||wrap)writing.visible=false;
      const amount=reduced?0:wrap?smoothEffect((age-2670)/650):0;
      const crumple=wrap&&!reduced?smoothEffect((age-3170)/430):0;
      sheets.forEach((g,half)=>{
        const positions=g.attributes.position;
        if(amount!==lastBend||crumple!==lastCrumple){
        for(let i=0;i<positions.count;i++){
          const column=i%9,row=Math.floor(i/9),x=(column/8-.5)*.2,y=(.5-row/16)*.46;
          const wholeX=x+(half===0?-.1:.1),theta=wholeX/.4*Math.PI*2*amount;
          // Curl first, then gather the top and bottom into an irregular,
          // faceted shell. Shared seam vertices use the same crease phase.
          const longitude=wholeX/.4*Math.PI*2,latitude=y/.23*Math.PI/2;
          const crease=Math.pow(Math.sin(longitude*5+row*2.4),2)*.022*Math.cos(latitude);
          const radius=.235+crease;
          const gatheredX=Math.sin(longitude)*Math.cos(latitude)*radius;
          const gatheredY=Math.sin(latitude)*radius;
          const gatheredZ=Math.cos(longitude)*Math.cos(latitude)*radius;
          const curledX=THREE.MathUtils.lerp(wholeX,Math.sin(theta)*.255,amount);
          positions.setXYZ(i,THREE.MathUtils.lerp(curledX,gatheredX,crumple)-(half===0?-.1:.1),
            THREE.MathUtils.lerp(y,gatheredY,crumple),THREE.MathUtils.lerp(amount*Math.cos(theta)*.255,gatheredZ,crumple));
        }
        positions.needsUpdate=true;g.computeVertexNormals();
        }
        const split=cut&&!reduced?smoothEffect((age-2720)/650):0;
        halves[half].position.set((half===0?-1:1)*(.1+split*.18),-split*.22,0);
        halves[half].rotation.z=(half===0?-1:1)*split*.5;
      });
      lastBend=amount;lastCrumple=crumple;
      // Reduced motion keeps the three-dimensional choices and readable result without strikes or debris.
    }
    return {root,update,dispose(){root.removeFromParent();sheets.forEach(g=>g.dispose());}};
  }
  return {create,dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
