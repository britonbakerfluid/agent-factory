import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AVATAR_ANIMATIONS } from '../client/prototypes/factory25dAvatar';
import { AVATAR_EYES, avatarEyePose } from '../client/prototypes/factory25dAvatarEyes';
import { avatarBodyFrame, avatarTexture, setAvatarTextureFrame } from '../client/prototypes/factory25dAvatarTexture';
import { drawCharacter, hexToInt, resolveAvatar, type AvatarEyes } from '../client/rendering/avatarPainter';
import { DEFAULT_AVATAR } from '../shared/constants';
import { snackHandPose } from '../client/prototypes/factory25dSnackCarry';

function painted(anim: string, eyes: AvatarEyes, frame = 0, accessory = 0) {
  const pixels = Array.from({ length:32 }, () => Array<string>(32).fill(''));
  const colors = resolveAvatar({ ...DEFAULT_AVATAR, hairStyle:2, hairColor:'#604332', faceAccessory:accessory });
  const ctx = { fillStyle:'', globalAlpha:1, clearRect() {}, fillRect(x:number,y:number,w:number,h:number) {
    for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) if(pixels[py]?.[px] !== undefined) pixels[py][px]=this.fillStyle;
  }};
  drawCharacter(ctx as unknown as CanvasRenderingContext2D,0,0,32,hexToInt(colors.shirtColor),anim,frame,colors,eyes);
  return pixels;
}
afterEach(() => vi.unstubAllGlobals());

it('holds glances with quiet intervals and desynchronizes short blinks across people', () => {
  const frames = Array.from({length:6000}, (_,i)=>avatarEyePose(i/100,37));
  expect(frames.filter(x=>x==='center').length/frames.length).toBeGreaterThan(.7);
  expect(new Set(frames)).toEqual(new Set(['center','left','right','blink']));
  let longestBlink=0, run=0;
  for(const frame of frames) {run=frame==='blink'?run+1:0;longestBlink=Math.max(longestBlink,run);}
  expect(longestBlink).toBeLessThanOrEqual(13);
  expect(frames).not.toEqual(Array.from({length:6000},(_,i)=>avatarEyePose(i/100,83)));
  expect(Array.from({length:6000},(_,i)=>avatarEyePose(i/100,37,'thinking'))).toContain('up');
});

it('keeps attention forward and freezes eye animation for reduced motion and ended sessions', () => {
  for(let t=0;t<60;t+=.03) {
    expect(['center','blink']).toContain(avatarEyePose(t,31,'attentive'));
    expect(['center','blink']).toContain(avatarEyePose(t,31,'moving'));
    expect(avatarEyePose(t,31,'thinking',true)).toBe('center');
    expect(avatarEyePose(t,31,'asleep',true)).toBe('blink');
  }
  expect(avatarEyePose(NaN,31)).toBe('center');
});

it('changes only eye pixels while keeping bodies, hands, hair and accessories intact', () => {
  for(const anim of ['idle','sit','walk_down','walk_left','walk_right','hold_left','hold_right']) for(const frame of [0,1,2,3]) {
    const neutral=painted(anim,'center',frame);
    for(const eyes of AVATAR_EYES) {
      const changed=painted(anim,eyes,frame);
      for(let y=0;y<32;y++) for(let x=0;x<32;x++) {
        if(changed[y][x]!==neutral[y][x]) expect(y>=8 && y<=11 && x>=10 && x<=21,`${anim}/${eyes} ${x},${y}`).toBe(true);
      }
      const glasses=painted(anim,eyes,frame,1), neutralGlasses=painted(anim,'center',frame,1);
      for(let y=0;y<32;y++) for(let x=0;x<32;x++) if(neutralGlasses[y][x]==='#666666') expect(glasses[y][x]).toBe('#666666');
    }
    expect(painted(anim,'blink',frame)).not.toEqual(neutral);
  }
  for(const anim of ['work','walk_up','sit_up','board','climb'])
    expect(painted(anim,'blink')).toEqual(painted(anim,'right')); // no eyes drawn through the back of a head
});

it('selects eye variants independently of the walk frame and carried-snack anchor', () => {
  const texture = new THREE.Texture(); texture.userData.avatarColumns=20; texture.repeat.set(1/20,1/8);
  for(let row=0;row<8;row++) for(let frame=0;frame<4;frame++) {
    setAvatarTextureFrame(texture,row,frame); const hand=snackHandPose(texture).clone();
    for(const eyes of AVATAR_EYES) {
      setAvatarTextureFrame(texture,row,frame,eyes);
      expect(avatarBodyFrame(texture)).toBe(frame);
      expect(snackHandPose(texture).distanceTo(hand)).toBeLessThan(1e-10);
      expect(texture.offset.x+texture.repeat.x).toBeLessThanOrEqual(1);
    }
  }
});

it('caches expression artwork without repainting each frame or changing the legacy portrait atlas', () => {
  let paints=0;
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({
    clearRect(){paints++;},fillRect(){}, getImageData:(_x:number,_y:number,width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)})
  })})});
  const look={...DEFAULT_AVATAR,shirtColor:'#85a171'};
  const a=avatarTexture(look,undefined,true), b=avatarTexture(look,undefined,true);
  expect(a.sheet).toBe(b.sheet);expect(a.texture).not.toBe(b.texture);
  const paintedFrames = AVATAR_ANIMATIONS.length * 4 * AVATAR_EYES.length;
  expect(a.sheet.canvas.width).toBe(640);expect(paints).toBe(paintedFrames);
  for(let i=0;i<100;i++) setAvatarTextureFrame(a.texture,0,i%4,AVATAR_EYES[i%5]);
  expect(paints).toBe(paintedFrames);expect(b.texture.offset.toArray()).toEqual([0,0]);
  const portrait=avatarTexture(look,['idle']);expect(portrait.sheet.canvas.width).toBe(128);
});
