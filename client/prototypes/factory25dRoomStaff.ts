import * as THREE from 'three';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarTexture } from './factory25dAvatarTexture';
import { createNameTag } from './factory25dLabels';
import { contactShadow } from './factory25dContactShadows';
import { AvatarWalkCycle } from './factory25dAvatarGait';
import type { BoardData } from './factory25dBoardData';
import type { AvatarConfig } from '@shared/types';

const poses = ['idle', 'walk_right', 'walk_left', 'walk_up', 'work', 'board'];
/** Room staff use the normal avatar painter but never create agent sessions, levels, or activity credit. */
export function createRoomStaff(scene: THREE.Scene, board: THREE.Group, canvas: HTMLCanvasElement, openBoard: () => void) {
  function staff(name: string, avatar: AvatarConfig, action: () => void) {
    const { sheet, texture } = avatarTexture(avatar, poses);
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .08, side: THREE.DoubleSide, roughness: 1,
      emissive: '#101126', emissiveIntensity: .6 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), material);
    mesh.name = name; mesh.castShadow = true; scene.add(mesh);
    const shadow = contactShadow(scene, { width: .22, depth: .12, spread: .065, opacity: .3, round: true });
    const label = createNameTag(name, false, canvas.parentElement!);
    label.element.dataset.roomStaff = name;
    const click = (event: MouseEvent) => { event.stopPropagation(); action(); };
    label.element.querySelector('button')!.addEventListener('click', click);
    const feet = new THREE.Vector3(), walk = new AvatarWalkCycle();
    return { mesh, shadow, label, walk,
      pose(row: number, frame: number, point: THREE.Vector3, camera: THREE.Camera, visible: boolean) {
        texture.offset.set(frame / 4, 1 - (row + 1) / poses.length);
        mesh.position.copy(point); mesh.position.y += (sheet.feet[row][frame] / 32 - .5) * .86 + .004;
        feet.set(0, (.5 - sheet.feet[row][frame] / 32) * .86, 0);
        mesh.visible = shadow.visible = visible;
        shadow.position.set(point.x, point.y + .004, point.z);
        label.update(mesh, point.y, camera, canvas, visible, undefined, feet);
      },
      dispose() { label.element.querySelector('button')!.removeEventListener('click', click); label.dispose(); mesh.removeFromParent(); shadow.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); }
    };
  }
  const manager = staff('board manager', { ...DEFAULT_AVATAR, shirtColor: '#5f8f78', color: '#5f8f78', hairStyle: 2, hairColor: '#604332', faceAccessory: 1, pantsColor: '#2b3440' }, openBoard);
  const desk = staff('front desk', { ...DEFAULT_AVATAR, shirtColor: '#b6854f', color: '#b6854f', hairStyle: 0, hairColor: '#242630', skinTone: '#c68e5a', mouthStyle: 1 }, () => document.querySelector<HTMLButtonElement>('.team-desk-hotspot')?.click());
  const managerPoint = new THREE.Vector3(), clerkPoint = new THREE.Vector3(-2.2, .018, 6.05);
  let previousTime = 0, managerX = .85, managerStatus = '', deskStatus = '';
  return {
    update(now: number, camera: THREE.Camera, visible: boolean, reduced: boolean, data: BoardData,
      task?: { point: THREE.Vector3; name: string; startsAt: number }) {
      const dt = previousTime ? Math.min(.05, (now - previousTime) / 1000) : 0; previousTime = now;
      const targetX = task ? task.point.x + .14 : .85;
      const dx = THREE.MathUtils.clamp(targetX - managerX, -dt * 1.1, dt * 1.1);
      managerX = reduced ? targetX : managerX + dx;
      board.updateWorldMatrix(true, false);
      managerPoint.set(managerX, .018, .54); board.localToWorld(managerPoint);
      const walking = !reduced && Math.abs(dx) > .001;
      const frame = manager.walk.sample({ x: managerPoint.x, z: managerPoint.z }, now / 1000, walking, reduced);
      manager.pose(walking ? dx > 0 ? 1 : 2 : task ? 5 : 3, walking ? frame : task && !reduced ? Math.floor(now / 220) % 4 : 0, managerPoint, camera, visible);
      const managerActivity = task ? `updating ${task.name}’s note` : 'keeping the board organized';
      if (managerStatus !== managerActivity) { managerStatus = managerActivity; manager.label.setDetails('board manager', managerActivity, 'room staff · click to read the whiteboard'); }
      // The receptionist faces visitors across the counter, then checks the room's team screen.
      const checking = !reduced && now % 18000 > 14500;
      desk.pose(checking ? 2 : 0, 0, clerkPoint, camera, visible);
      const people = new Set(data.agents.map(agent => agent.owner)).size;
      const deskActivity = data.connected ? `${people} people here · welcoming the team` : 'waiting for the factory connection';
      if (deskStatus !== deskActivity) { deskStatus = deskActivity; desk.label.setDetails('front desk', deskActivity, 'room staff · click to see who’s here'); }
      canvas.dataset.roomStaff = '2'; canvas.dataset.boardManager = task ? 'updating-note' : 'watching-board';
    },
    dispose() { manager.dispose(); desk.dispose(); }
  };
}
