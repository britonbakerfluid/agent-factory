import * as THREE from 'three';
import { FRONT_COUNTER } from '@shared/factory25d-layout';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarTexture, setAvatarTextureFrame } from './factory25dAvatarTexture';
import { avatarEyePose } from './factory25dAvatarEyes';
import { createNameTag } from './factory25dLabels';
import { contactShadow } from './factory25dContactShadows';
import { AvatarWalkCycle } from './factory25dAvatarGait';
import { BoardManager, BoardManagerAnimation } from './factory25dBoardManager';
import type { installBoardDragging } from './factory25dBoardDrag';
import type { BoardData } from './factory25dBoardData';
import type { AvatarConfig } from '@shared/types';
import { StaffCleanup, type FixtureCleanupJob } from './factory25dStaffCleanup';
import './factory25dRoomStaff.css';

const poses = ['idle', 'walk_right', 'walk_left', 'walk_up', 'work', 'board', 'walk_down', 'hold_left', 'hold_right', 'hold_up', 'hold_down'];
/** Room staff use the normal avatar painter but never create agent sessions, levels, or activity credit. */
export function createRoomStaff(scene: THREE.Scene, board: THREE.Group, canvas: HTMLCanvasElement, openBoard: () => void,
  boardMotion: ReturnType<typeof installBoardDragging>) {
  let eyeTime = 0, eyesFrozen = false;
  function staff(name: string, avatar: AvatarConfig, action: () => void) {
    const { sheet, texture } = avatarTexture(avatar, poses, true);
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .08, side: THREE.DoubleSide, roughness: 1,
      emissive: '#101126', emissiveIntensity: .6 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), material);
    mesh.name = name; mesh.castShadow = true; scene.add(mesh);
    const shadow = contactShadow(scene, { width: .22, depth: .12, spread: .065, opacity: .3, round: true });
    const label = createNameTag(name, false, canvas.parentElement!);
    label.element.classList.add('room-staff-label');
    label.element.dataset.roomStaff = name;
    const click = (event: MouseEvent) => { event.stopPropagation(); action(); };
    label.element.querySelector('button')!.addEventListener('click', click);
    const feet = new THREE.Vector3(), walk = new AvatarWalkCycle(), corner = new THREE.Vector3(), top = new THREE.Vector3();
    return { mesh, shadow, label, walk,
      pose(row: number, frame: number, point: THREE.Vector3, camera: THREE.Camera, visible: boolean) {
        setAvatarTextureFrame(texture, row, frame, avatarEyePose(eyeTime, name === 'board manager' ? 37 : 83, 'relaxed', eyesFrozen));
        mesh.position.copy(point); mesh.position.y += (sheet.feet[row][frame] / 32 - .5) * .86 + .004;
        feet.set(0, (.5 - sheet.feet[row][frame] / 32) * .86, 0);
        mesh.visible = shadow.visible = visible;
        shadow.position.set(point.x, point.y + .004, point.z);
        label.update(mesh, point.y, camera, canvas, visible, undefined, feet);
        if (visible) {
          // The transparent hit area scales with the visible character, not a
          // missing caption or the empty transparent pixels around the sprite.
          corner.set(point.x - .25, point.y, point.z).project(camera);
          top.set(point.x + .25, point.y + .71, point.z).project(camera);
          label.element.style.setProperty('--staff-hit-width', `${Math.max(24, Math.abs(top.x - corner.x) * canvas.clientWidth / 2)}px`);
          label.element.style.setProperty('--staff-hit-height', `${Math.max(24, Math.abs(top.y - corner.y) * canvas.clientHeight / 2)}px`);
        }
      },
      dispose() { label.element.querySelector('button')!.removeEventListener('click', click); label.dispose(); mesh.removeFromParent(); shadow.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); }
    };
  }
  const manager = staff('board manager', { ...DEFAULT_AVATAR, shirtColor: '#5f8f78', color: '#5f8f78', hairStyle: 2, hairColor: '#604332', faceAccessory: 1, pantsColor: '#2b3440' }, openBoard);
  const desk = staff('front desk', { ...DEFAULT_AVATAR, shirtColor: '#b6854f', color: '#b6854f', hairStyle: 0, hairColor: '#242630', skinTone: '#c68e5a', mouthStyle: 1 }, () => document.querySelector<HTMLButtonElement>('.team-desk-hotspot')?.click());
  const managerPoint = new THREE.Vector3(), clerkPoint = new THREE.Vector3(FRONT_COUNTER.x+.65, .018, FRONT_COUNTER.z-.6);
  const cleanup = new StaffCleanup({ x: clerkPoint.x, z: clerkPoint.z });
  const managerLife = new BoardManager(boardMotion.home, boardMotion.restingYaw);
  const managerAnimation = new BoardManagerAnimation();
  let previousTime = 0, managerStatus = '', deskStatus = '';
  return {
    enqueueCleanup(job: FixtureCleanupJob) { cleanup.enqueue(job); },
    update(now: number, camera: THREE.Camera, visible: boolean, reduced: boolean, data: BoardData,
      task?: { point: THREE.Vector3; name: string; startsAt: number }) {
      eyeTime = now / 1000; eyesFrozen = reduced;
      const dt = previousTime ? Math.min(.05, (now - previousTime) / 1000) : 0; previousTime = now;
      // The writing pose raises the right hand, so its body stands a little
      // left of the note instead of reaching farther away from the paper.
      const noteOffset = task ? managerLife.offset(task.point.x - .23, .56) : undefined;
      const movedBoard = managerLife.update(dt, board.position, boardMotion.isBusy(), visible,
        noteOffset && task && { x: board.position.x + noteOffset.x, z: board.position.z + noteOffset.z,
          id: `${task.name}:${task.startsAt}`, label: task.name });
      if (movedBoard) boardMotion.moveByStaff(movedBoard);
      // Staff stand on the room floor. The board transform never carries them.
      managerPoint.set(managerLife.position.x, .018, managerLife.position.z);
      board.parent!.updateWorldMatrix(true, false); board.parent!.localToWorld(managerPoint);
      const { phase, holding } = managerLife;
      const managerPose = managerAnimation.sample(managerLife, reduced), row = Math.max(0, poses.indexOf(managerPose.animation));
      manager.pose(row, managerPose.frame, managerPoint, camera, visible);
      const managerActivity = phase === 'waiting' ? 'waiting for you to finish moving the board'
        : phase === 'approaching' ? 'walking over to collect the board'
        : holding ? 'putting the whiteboard back'
        : phase === 'writing' && managerLife.taskName ? `updating ${managerLife.taskName}’s note`
        : phase === 'walking-to-note' ? 'walking over to update a note' : 'keeping the board organized';
      if (managerStatus !== managerActivity) { managerStatus = managerActivity; manager.label.setDetails('board manager', managerActivity, 'room staff · click to read the whiteboard'); }
      // A receptionist finishes each small cleanup before returning to the desk.
      cleanup.update(dt, visible);
      clerkPoint.set(cleanup.position.x, .018, cleanup.position.z);
      const deskWalking = Math.hypot(cleanup.motion.x, cleanup.motion.z) > .0001;
      const deskFrame = desk.walk.sample(cleanup.position, now / 1000, deskWalking, reduced);
      const checking = cleanup.phase === 'idle' && !reduced && now % 18000 > 14500;
      const face = cleanup.phase === 'cleaning' ? cleanup.facing : cleanup.motion;
      const deskRow = cleanup.phase === 'cleaning'
        ? Math.abs(face.x) > Math.abs(face.z) ? face.x > 0 ? 8 : 7 : face.z < 0 ? 9 : 4
        : deskWalking ? Math.abs(face.x) > Math.abs(face.z) ? face.x > 0 ? 1 : 2 : face.z > 0 ? 6 : 3
        : checking ? 2 : 0;
      desk.pose(deskRow, deskWalking ? deskFrame : 0, clerkPoint, camera, visible);
      const people = new Set(data.agents.map(agent => agent.owner)).size;
      const deskActivity = cleanup.phase === 'walking' ? `walking over to the ${cleanup.job?.label ?? 'lamp'}`
        : cleanup.phase === 'cleaning' ? `putting the ${cleanup.job?.label ?? 'lamp'} back upright`
        : cleanup.phase === 'returning' ? 'heading back to the front desk'
        : data.connected ? `${people} people here · welcoming the team` : 'waiting for the factory connection';
      if (deskStatus !== deskActivity) { deskStatus = deskActivity; desk.label.setDetails('front desk', deskActivity, 'room staff · click to see who’s here'); }
      canvas.dataset.roomStaff = '2'; canvas.dataset.boardManager = phase;
      canvas.dataset.boardManagerPose = poses[row];
      canvas.dataset.boardManagerFrame = String(managerPose.frame);
      canvas.dataset.boardManagerPosition = `${managerLife.position.x.toFixed(3)},${managerLife.position.z.toFixed(3)}`;
      canvas.dataset.boardPosition = `${board.position.x.toFixed(3)},${board.position.z.toFixed(3)}`;
      canvas.dataset.frontDeskActivity = cleanup.phase;
      canvas.dataset.frontDeskCleanup = cleanup.job?.id ?? '';
      canvas.dataset.frontDeskPosition = `${clerkPoint.x.toFixed(3)},${clerkPoint.z.toFixed(3)}`;
    },
    dispose() { cleanup.dispose(); manager.dispose(); desk.dispose(); }
  };
}
