import type { AvatarConfig } from '@shared/types';
import { avatarSheet } from './factory25dAvatar';
import './factory25dPortrait.css';

const portraits = new Map<string, HTMLCanvasElement>();
/** Shared upper-body portrait, clipped to a circle on a two-pixel grid. */
export function avatarPortrait(avatar: AvatarConfig) {
  const key = JSON.stringify(avatar), previous = portraits.get(key);
  if (previous) return previous;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
  const ink = canvas.getContext('2d')!; ink.imageSmoothingEnabled = false;
  // Clip before painting so both background and artwork share the stepped edge.
  ink.beginPath();
  for (let y = 0; y < 48; y += 2) {
    const half = Math.floor(Math.sqrt(24 ** 2 - (y + 1 - 24) ** 2) / 2) * 2;
    ink.rect(24 - half, y, half * 2, 2);
  }
  ink.clip(); ink.fillStyle = '#3a5849'; ink.fillRect(0, 0, 48, 48);
  ink.drawImage(avatarSheet(avatar, ['idle']).canvas, 4, -2, 24, 24, 0, 0, 48, 48);
  portraits.set(key, canvas);
  if (portraits.size > 48) portraits.delete(portraits.keys().next().value!);
  return canvas;
}

export function createProfilePortrait(avatar: AvatarConfig) {
  const image = document.createElement('span'); image.className = 'factory-portrait';
  image.setAttribute('aria-hidden', 'true');
  const source = avatarPortrait(avatar), copy = source.cloneNode() as HTMLCanvasElement;
  copy.getContext('2d')!.drawImage(source, 0, 0); image.append(copy); return image;
}
