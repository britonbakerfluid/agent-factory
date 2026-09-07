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
