import { DJ_BOOTH, INTERIOR_Z } from '@shared/factory25d-layout';
import { createStaffPickup, updatePickupShadow } from './factory25dPickup';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarTexture, setAvatarTextureFrame, installAvatarBack } from './factory25dAvatarTexture';
import { avatarEyePose } from './factory25dAvatarEyes';
import { createNameTag } from './factory25dLabels';
import { contactShadow } from './factory25dContactShadows';
import './factory25dRoomStaff.css';

const poses = ['idle', 'hold_left'];
const SCALE = .86;
const BOOTH_RISER = .24;

/** A room-staff character, never an agent session or a source of activity credit. */
export function createRadioDj(parent: THREE.Group, canvas: HTMLCanvasElement, onClick: () => void) {
  const avatar={ ...DEFAULT_AVATAR, shirtColor: '#638b88', color: '#638b88',
    hairStyle: 0, hairColor: '#302e39', skinTone: '#c68e5a', pantsColor: '#303447', shoeColor: '#443c42',
    mouthStyle: 1, faceAccessory: 0, headAccessory: 0 };
  const {sheet,texture}=avatarTexture(avatar,poses,true);
  // The avatar cache is immutable. Headphones and one-pixel head nods are painted
  // into this NPC's own copy, preserving every eye variant and grounded shoe row.
  const painted = document.createElement('canvas'); painted.width = sheet.canvas.width; painted.height = sheet.canvas.height;
  const ctx = painted.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(sheet.canvas, 0, 0);
  for (let row = 0; row < poses.length; row++) for (let column = 0; column < painted.width / 32; column++) {
    const x = column * 32, y = row * 32, nod = row === 0 && column % 4 === 3 ? 1 : 0;
    if (nod) {
      ctx.clearRect(x + 8, y, 16, 15);
      ctx.drawImage(sheet.canvas, x + 8, y, 16, 15, x + 8, y + nod, 16, 15);
    }
    ctx.fillStyle = '#333747';
    if (row === 0) {
      ctx.fillRect(x + 10, y + 2 + nod, 12, 2);
      ctx.fillRect(x + 9, y + 3 + nod, 2, 8); ctx.fillRect(x + 21, y + 3 + nod, 2, 8);
      ctx.fillRect(x + 8, y + 7 + nod, 3, 5); ctx.fillRect(x + 21, y + 7 + nod, 3, 5);
      ctx.fillStyle = '#c1a878'; ctx.fillRect(x + 8, y + 8 + nod, 1, 3); ctx.fillRect(x + 23, y + 8 + nod, 1, 3);
    } else {
      ctx.fillRect(x + 12, y + 3, 9, 2); ctx.fillRect(x + 18, y + 4, 2, 7);
      ctx.fillRect(x + 17, y + 7, 4, 5); ctx.fillStyle = '#c1a878'; ctx.fillRect(x + 19, y + 8, 1, 3);
    }
  }
  texture.image = painted; texture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .08, side: THREE.DoubleSide,
    roughness: 1, emissive: '#101126', emissiveIntensity: .6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SCALE, SCALE), material);
    installAvatarBack(mesh);
  mesh.name = 'lounge DJ'; mesh.castShadow = true; parent.add(mesh);
  // Behind the mixer, clear of the coffee table and soccer ball.
  const point = new THREE.Vector3(DJ_BOOTH.x, .018, DJ_BOOTH.z - INTERIOR_Z - .60);
  const shadow = contactShadow(parent, { x: point.x, z: point.z, floorY: point.y,
    width: .22, depth: .12, spread: .065, opacity: .3, round: true });
  const label = createNameTag('lounge DJ', false, canvas.parentElement!);
  label.setAvatar(avatar);
  label.element.classList.add('room-staff-label'); label.element.dataset.roomStaff = 'lounge DJ'; label.element.dataset.cardPlacement = 'above-body';
  label.setDetails('lounge DJ', 'keeping the lounge music flowing', 'room staff');
  const button = label.element.querySelector('button')!;
  const pickup=createStaffPickup(mesh,button,canvas,avatar);
  button.setAttribute('aria-label', 'Lounge DJ · open radio');
  let visible = false, disposed = false, lastEntry: number | undefined, choosingUntil = 0, lastActivity = '';
  const click = (event: MouseEvent) => { event.stopPropagation(); if (visible && !disposed) onClick(); };
  button.addEventListener('click', click);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const feet = new THREE.Vector3(), corner = new THREE.Vector3(), top = new THREE.Vector3(), worldPoint = new THREE.Vector3();
  mesh.visible = shadow.visible = false; label.element.hidden = true;
  return {
    update(camera: THREE.Camera, nextVisible: boolean, entryId: number | undefined, isDj: boolean) {
      if (disposed) return;
      visible = nextVisible;
      const now = performance.now(), reduced = reducedMotion.matches;
      if (entryId !== lastEntry) {
        lastEntry = entryId;
        choosingUntil = visible && isDj && entryId !== undefined && !reduced ? now + 1350 : 0;
      }
      if (!visible || reduced) choosingUntil = 0;
      const choosing = now < choosingUntil;
      const row = choosing&&!pickup.airborne ? 1 : 0;
      // A brief one-pixel head nod every few seconds; shoes never bob off the floor.
      const frame = !reduced && !choosing && entryId !== undefined && (now % 4400) > 3820 ? 3 : 0;
      setAvatarTextureFrame(texture, row, frame, avatarEyePose(now / 1000, 121, choosing ? 'attentive' : 'relaxed', reduced));
      mesh.position.copy(point); mesh.position.y += BOOTH_RISER + (sheet.feet[row][frame] / 32 - .5) * SCALE + .004;
      feet.set(0, (.5 - sheet.feet[row][frame] / 32) * SCALE, 0);
      mesh.visible = shadow.visible = visible;
      parent.updateWorldMatrix(true, false); parent.localToWorld(worldPoint.copy(point));
      shadow.position.set(point.x,point.y+.003,point.z);
      pickup.update(camera);
      updatePickupShadow(mesh,shadow,camera,pickup.shadowAirborne);
      if(pickup.busy&&!pickup.shadowAirborne){shadow.position.x=mesh.position.x;shadow.position.z=mesh.position.z;}
      label.update(mesh, worldPoint.y, camera, canvas, visible, undefined, feet);
      if (visible) {
        corner.set(point.x - .25, point.y + BOOTH_RISER, point.z); top.set(point.x + .25, point.y + BOOTH_RISER + .71, point.z);
        parent.localToWorld(corner); parent.localToWorld(top); corner.project(camera); top.project(camera);
        label.element.style.setProperty('--staff-hit-width', `${Math.max(16, Math.abs(top.x - corner.x) * canvas.clientWidth / 2)}px`);
        label.element.style.setProperty('--staff-hit-height', `${Math.max(20, Math.abs(top.y - corner.y) * canvas.clientHeight / 2)}px`);
      }
      const activity = choosing ? 'choosing the next lounge track'
        : entryId === undefined ? 'keeping the radio ready' : isDj ? 'playing a lounge selection' : 'listening to the shared queue';
      if (activity !== lastActivity) { lastActivity = activity; label.setDetails('lounge DJ', activity, 'room staff'); }
    },
    dispose() {
      if (disposed) return;
      pickup.dispose();disposed = true; button.removeEventListener('click', click); label.dispose();
      mesh.removeFromParent(); shadow.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose();
      // Contact shadows share geometry/material with all other room staff.
    },
  };
}
