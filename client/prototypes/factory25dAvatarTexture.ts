import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { AVATAR_EYES } from './factory25dAvatarEyes';
import type { AvatarEyes } from '../rendering/avatarPainter';

/** Share painted pixels, but keep each sprite's frame offsets and lifetime independent. */
export function avatarTexture(avatar: AvatarConfig, animations: readonly string[] = AVATAR_ANIMATIONS, expressive = false) {
  const sheet = expressive ? avatarSheet(avatar, animations, AVATAR_EYES) : avatarSheet(avatar, animations);
  const texture = new THREE.CanvasTexture(sheet.canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.repeat.set(32 / sheet.canvas.width, 1 / animations.length);
  texture.userData.avatarColumns = sheet.canvas.width / 32;
  texture.userData.backFactory=()=>{
    const back=avatarSheet(avatar,animations,expressive?AVATAR_EYES:[undefined],false,true);
    const map=new THREE.CanvasTexture(back.canvas);map.colorSpace=THREE.SRGBColorSpace;map.minFilter=map.magFilter=THREE.NearestFilter;map.generateMipmaps=false;return map;
  };
  texture.addEventListener('dispose',()=>texture.userData.backTexture?.dispose());
  return { sheet, texture };
}

export function setAvatarTextureFrame(texture: THREE.Texture, row: number, frame: number, eyes: AvatarEyes = 'center') {
  const columns = texture.userData.avatarColumns ?? 4;
  const expression = columns > 4 ? Math.max(0, AVATAR_EYES.indexOf(eyes)) : 0;
  texture.offset.set((expression * 4 + frame) / columns, 1 - (row + 1) * texture.repeat.y);
}

/** Props follow body frames, independently of which eye variant is selected. */
export function avatarBodyFrame(texture: THREE.Texture) {
  return Math.round(texture.offset.x * (texture.userData.avatarColumns ?? 4)) % 4;
}

/** Each side of a flat avatar has its own artwork, while sharing pose/frame UVs. */
export function installAvatarBack(mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>){
  const backMap={value:null as THREE.Texture|null},frame={value:new THREE.Vector2()};
  mesh.material.onBeforeCompile=shader=>{
    shader.uniforms.avatarBack=backMap;shader.uniforms.avatarFrame=frame;
    shader.fragmentShader='uniform sampler2D avatarBack; uniform vec2 avatarFrame;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec2 backUv=vec2(2.0*avatarFrame.x+avatarFrame.y-vMapUv.x,vMapUv.y);
        vec4 sampledDiffuseColor=gl_FrontFacing?texture2D(map,vMapUv):texture2D(avatarBack,backUv);
        diffuseColor*=sampledDiffuseColor;
      #endif
    `);
  };
  mesh.material.customProgramCacheKey=()=> 'avatar-front-and-back-v1';
  mesh.onBeforeRender=()=>{
    const map=mesh.material.map;if(!map)return;
    if(!map.userData.backTexture&&map.userData.backFactory)map.userData.backTexture=map.userData.backFactory();
    backMap.value=map.userData.backTexture??map;frame.value.set(map.offset.x,map.repeat.x);
  };
}
