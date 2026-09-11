import * as THREE from 'three';
import {batchStaticSiblings} from './factory25dStaticBatch';
import { DJ_BOOTH } from '@shared/factory25d-layout';
import {propPart,standard} from './factory25dProps';

/** Twin vinyl decks, a central mixer and softly animated channel meters. */
export function createDjDecks(parent:THREE.Group){
  const booth=new THREE.Group();booth.name='dj-decks';parent.add(booth);
  const charcoal=standard('#20282c'),metal=standard('#738586',.4),wood=standard('#725140');
  const vinyl=standard('#14191c',1),label=standard('#bb7953'),cream=standard('#ccd5cc');
  propPart(booth,[DJ_BOOTH.width,.075,DJ_BOOTH.depth],[0,.48,.12],wood);
  // A solid booth shell, open at the DJ's side, replaces the exposed table legs.
  for(const x of [-.69,.69])propPart(booth,[.10,.45,1.04],[x,.225,.12],wood);
  propPart(booth,[1.30,.45,.08],[0,.225,.60],charcoal);
  propPart(booth,[1.38,.055,.96],[0,.0275,.12],charcoal);
  propPart(booth,[1.42,.07,1.04],[0,.545,.12],charcoal);
  const platters:THREE.Group[]=[];
  for(const x of [-.36,.36]){
    const disc=new THREE.Group();disc.name='spinning-vinyl';disc.position.set(x,.59,0);booth.add(disc);platters.push(disc);
    const surface=new THREE.Group();surface.position.copy(disc.position);booth.add(surface);
    const cylinder=(radius:number,height:number,y:number,material:THREE.Material,target:THREE.Group=surface)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,96),material);mesh.position.y=y;target.add(mesh);return mesh;
    };
    // Keep circular surfaces stationary: rotating their tessellation causes pixel shimmer.
    cylinder(.185,.016,0,metal);cylinder(.168,.012,.01,vinyl);
    cylinder(.066,.006,.020,label,disc);cylinder(.009,.022,.026,cream);
    const grooveMaterial=new THREE.MeshBasicMaterial({color:'#252d30'});
    for(const radius of [.108,.143]){const ring=new THREE.Mesh(new THREE.RingGeometry(radius-.0025,radius+.0025,96),grooveMaterial);ring.rotation.x=-Math.PI/2;ring.position.y=.0165;surface.add(ring);}
    // An asymmetric label and broad cue stripe make the rotation legible from across the room.
    const sector=new THREE.Mesh(new THREE.CircleGeometry(.062,24,0,Math.PI*.7),new THREE.MeshBasicMaterial({color:'#e4cfaa'}));
    sector.rotation.x=-Math.PI/2;sector.position.y=.0235;disc.add(sector);
    propPart(disc,[.064,.003,.024],[.112,.019,0],cream);
    // Mount each tonearm on the outside of its deck, away from the mixer.
    const side=Math.sign(x);
    const arm=propPart(booth,[.016,.018,.21],[x+side*.16,.635,-.035],metal);arm.rotation.y=-side*.3;
    propPart(booth,[.028,.025,.055],[x+side*.129,.631,.065],charcoal);
    propPart(booth,[.055,.012,.025],[x-.12,.591,.175],cream);
  }
  propPart(booth,[.24,.016,.37],[0,.59,0],metal);
  for(const x of [-.065,0,.065]){
    propPart(booth,[.008,.005,.135],[x,.602,.015],charcoal);
    propPart(booth,[.037,.02,.015],[x,.614,.04-x],cream);
    for(const z of [-.13,-.09]){const knob=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.027,8),charcoal);knob.position.set(x,.617,z);booth.add(knob);}
  }
  const meters:THREE.Mesh[]=[];
  for(const x of [-.025,.025])for(let i=0;i<5;i++){
    const material=new THREE.MeshBasicMaterial({color:i>3?'#eac879':'#7acfb3'});
    const led=propPart(booth,[.017,.008,.012],[x,.614,.10+i*.014],material);meters.push(led);
  }
  for(const x of [-.65,.65]){
    propPart(booth,[.13,.25,.17],[x,.705,-.24],charcoal);
    for(const y of [.665,.765]){const cone=new THREE.Mesh(new THREE.CylinderGeometry(.043,.034,.012,16),vinyl);cone.rotation.x=Math.PI/2;cone.position.set(x,y,-.149);booth.add(cone);}
  }
  const glow=new THREE.MeshBasicMaterial({color:'#76b8ba'});propPart(booth,[1.35,.009,.009],[0,.475,.674],glow);
  booth.userData.savedDrawCalls=batchStaticSiblings(booth,booth.children.filter((child):child is THREE.Mesh=>child instanceof THREE.Mesh&&!meters.includes(child)));
  const pixels=new Uint8Array(16*16*4);
  const rect=(x:number,y:number,w:number,h:number)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)pixels.fill(255,(row*16+col)*4,(row*16+col)*4+4);};
  rect(9,2,2,10);rect(11,3,2,2);rect(13,5,2,3);rect(5,10,6,3);rect(4,11,6,3);
  const noteTexture=new THREE.DataTexture(pixels,16,16);noteTexture.flipY=true;noteTexture.needsUpdate=true;
  noteTexture.magFilter=noteTexture.minFilter=THREE.NearestFilter;
  const notes=Array.from({length:6},(_,i)=>{
    const material=new THREE.SpriteMaterial({map:noteTexture,color:i%2?'#53bdff':'#ffd36a',transparent:true,depthWrite:false,toneMapped:false});
    const sprite=new THREE.Sprite(material);sprite.name='dj-speaker-music-note';sprite.visible=false;booth.add(sprite);return sprite;
  });
  let lastTime:number|undefined,phase=0;
  return {booth,dispose(){notes.forEach(note=>{note.removeFromParent();note.material.dispose();});noteTexture.dispose();},update(time:number,playing:boolean,reduced:boolean){
    const dt=lastTime===undefined?0:Math.min(.1,Math.max(0,time-lastTime));lastTime=time;
    if(playing&&!reduced)phase+=dt;
    notes.forEach((note,i)=>{
      note.visible=playing&&!reduced;
      const progress=(phase/2.4+(i%3)/3)%1,side=i<3?-1:1;
      note.position.set(side*(.65+.30*progress)+Math.sin(progress*5+i)*.025,.78+progress*.68,-.12+progress*.06);
      note.scale.setScalar(.14+progress*.07);
      note.material.opacity=Math.min(1,progress*8)*(1-progress)*.85;
      note.material.rotation=side*Math.sin(progress*3)*.18;
    });
    platters.forEach((disc,i)=>{disc.rotation.y=reduced?0:time*(playing?3.49:1.75)+i*Math.PI*.6;});
    meters.forEach((led,i)=>{const on=playing&&(reduced?i%5<3:Math.sin(time*5+i*.8)>.05);(led.material as THREE.MeshBasicMaterial).color.set(on?(i%5===4?'#eac879':'#7acfb3'):'#263b36');});
  }};
}
