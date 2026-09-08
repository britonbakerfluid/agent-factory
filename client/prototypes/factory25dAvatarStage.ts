import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { avatarTexture, setAvatarTextureFrame } from './factory25dAvatarTexture';
import { avatarEyePose } from './factory25dAvatarEyes';
import { AVATAR_FRAME_DISTANCE } from './factory25dAvatarGait';
import { blendCamera, cameraPose } from './factory25dCameraMotion';
import { avatarClearanceRoute, avatarWalkablePoint } from './factory25dAvatarClearance';
import { factoryScenePoint, factoryWorldPoint, GARAGE_LEVEL, routeToStation,
  type FactoryRoom, type RoomPoint } from '@shared/factory25d-layout';
import { patioFloorHeight } from '@shared/factory25d-patio';
import type { createLiveAgents } from './factory25dLiveAgents';

/** A local draft walks out of furniture before its in-room close-up. */
export function createAvatarStage(factory: THREE.Scene, patio: THREE.Scene, garage: THREE.Scene,
  agents: ReturnType<typeof createLiveAgents>, canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer,
  currentCamera: () => THREE.OrthographicCamera, selected: () => string | undefined,
  indoorFloor: (point: RoomPoint) => number = () => .018) {
  const camera = currentCamera().clone(), targetCamera = camera.clone();
  const destination = cameraPose(targetCamera), returning = cameraPose(camera);
  const material = new THREE.MeshStandardMaterial({ alphaTest: .08, transparent: true, side: THREE.DoubleSide, roughness: 1,
    emissive: '#101126', emissiveIntensity: .6 });
  const model = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), material); model.name = 'avatar-edit-draft';
  model.castShadow = true;
  // Dim the whole rendered room, then draw the draft at its normal brightness.
  // Keep depth testing on the draft so it still walks around actual furniture.
  const dimMaterial = new THREE.ShaderMaterial({
    uniforms: { amount: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float amount; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, amount); }',
  });
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dimMaterial);
  dim.name = 'avatar-edit-room-dim'; dim.frustumCulled = false;
  dim.renderOrder = 10000; model.renderOrder = 10001;
  let dimAmount = 0;
  // Offscreen window/reflection passes should keep the original room lighting.
  dim.onBeforeRender = (_renderer, _scene, view) => { dimMaterial.uniforms.amount.value = view === camera ? dimAmount : 0; };
  const key = new THREE.PointLight('#ffe7d1', 0, 3.5, 2), fill = new THREE.PointLight('#c8dfef', 0, 3, 2);
  key.name = 'avatar-edit-key'; fill.name = 'avatar-edit-fill';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let sheet: ReturnType<typeof avatarSheet>, texture: THREE.CanvasTexture | undefined;
  let active = false, entering = false, started = 0, direction = 0, walking = false, walkStarted = 0;
  let targetId: string | undefined, hiddenMesh: THREE.Object3D | undefined, targetScene = factory;
  let hiddenShadow: THREE.Object3D | undefined, originalShadowVisible = true, stageRoom: FactoryRoom = 'factory';
  let originalVisible = true, from = cameraPose(camera), room = from, floor = 0;
  let width = 0, height = 0, roomHeight = 1, lastProgress = -1;
  let route: THREE.Vector3[] = [], routeLength = 0, walkDuration = 0, travelDirection = 0, travelled = 0;
  let travelling = false;
  const anchor = new THREE.Vector3(), focus = new THREE.Vector3(), aim = new THREE.Vector3();
  function restore() {
    if (hiddenMesh) hiddenMesh.visible = originalVisible;
    if (hiddenShadow) hiddenShadow.visible = originalShadowVisible;
    hiddenMesh = hiddenShadow = undefined;
  }
  function hide(entry: NonNullable<ReturnType<typeof agents.entries.get>>) {
    hiddenMesh = entry.mesh; originalVisible = hiddenMesh.visible; hiddenMesh.visible = false;
    hiddenShadow = entry.shadow; originalShadowVisible = hiddenShadow?.visible ?? true;
    if (hiddenShadow) hiddenShadow.visible = false;
  }
  function floorAt(point: RoomPoint) {
    return stageRoom === 'garage' ? GARAGE_LEVEL + .018 : stageRoom === 'patio' ? patioFloorHeight(point) + .018 : indoorFloor(point);
  }
  function floorPoint(point: RoomPoint) {
    const local = factoryScenePoint(point); return new THREE.Vector3(local.x, floorAt(point), local.z);
  }
  function startWalk(points: THREE.Vector3[]) {
    route = points; routeLength = 0;
    for (let i = 1; i < points.length; i++) routeLength += points[i].distanceTo(points[i - 1]);
    walkDuration = reduced.matches ? 0 : routeLength / 2 * 1000;
    travelling = routeLength > .01; travelled = 0;
  }
  function walkAt(now: number) {
    const distance = walkDuration ? Math.min(routeLength, Math.max(0, now - started) / walkDuration * routeLength) : routeLength;
    travelled = distance; travelling = distance < routeLength;
    let remaining = distance;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], length = a.distanceTo(b);
      if (remaining <= length || i === route.length - 1) {
        anchor.lerpVectors(a, b, length ? Math.min(1, remaining / length) : 1); floor = anchor.y;
        const dx = b.x - a.x, dz = b.z - a.z;
        travelDirection = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 1 : 3 : dz > 0 ? 0 : 2;
        return;
      }
      remaining -= length;
    }
  }
  function finish() {
    active = false; restore(); model.removeFromParent(); dim.removeFromParent(); key.removeFromParent(); fill.removeFromParent();
    document.body.classList.remove('avatar-stage-open'); renderer.setSize(800, 564, false);
    if (!document.querySelector('dialog[open]')) document.querySelector<HTMLButtonElement>('.factory-edit-avatar')?.focus({ preventScroll: true });
  }
  function setAvatar(avatar: AvatarConfig) {
    texture?.dispose(); ({ sheet, texture } = avatarTexture(avatar, AVATAR_ANIMATIONS, true));
    material.map = texture; material.needsUpdate = true;
  }
  return {
    camera, isActive: () => active, scene: () => targetScene, focusPoint: () => focus,
    open(context: { ownerId: string }) {
      if (active) finish();
      const mine = [...agents.entries.values()].filter(entry => entry.session.ownerId === context.ownerId);
      const entry = mine.find(entry => entry.session.sessionId === selected()) ?? mine[0];
      targetId = entry?.session.sessionId;
      if (entry) agents.finishArrival?.(entry.session.sessionId);
      targetScene = entry?.mesh.parent === garage ? garage : entry?.mesh.parent === patio ? patio : factory;
      stageRoom = targetScene === garage ? 'garage' : targetScene === patio ? 'patio' : 'factory';
      anchor.copy(entry?.mesh.position ?? new THREE.Vector3(1.65, .45, 7.8));
      // The sprite may be arriving, jumping or sitting above its support. Only
      // the room floor is a stable origin for the separate editor draft.
      floor = floorAt(factoryWorldPoint(anchor, stageRoom));
      anchor.y = floor;
      const origin = factoryWorldPoint(anchor, stageRoom);
      const path = avatarClearanceRoute(targetScene, stageRoom, origin, (entry?.seatBlend ?? 0) > .01, floorAt);
      startWalk([anchor.clone(), ...path.map(floorPoint)]);
      if (entry) hide(entry);
      model.position.copy(anchor); dimAmount = 0; targetScene.add(model, dim, key, fill);
      model.userData.sessionId = targetId;
      setAvatar(entry?.session.avatar ?? DEFAULT_AVATAR);
      room = cameraPose(currentCamera()); from = room;
      returning.position.copy(room.position); returning.quaternion.copy(room.quaternion);
      roomHeight = Math.max(1, canvas.clientHeight);
      active = entering = true; started = performance.now(); direction = 0; walking = false;
      width = height = 0; lastProgress = -1; document.body.classList.add('avatar-stage-open');
    },
    setAvatar,
    pose(turn: number, walk: boolean) {
      if (walk && !walking) walkStarted = performance.now();
      direction = turn; walking = walk;
    },
    close() {
      if (!active || !entering) return;
      walkAt(performance.now());
      const points = [anchor.clone()], entry = targetId ? agents.entries.get(targetId) : undefined;
      if (entry?.mesh.parent === targetScene) {
        const target = factoryWorldPoint(entry.mesh.position, stageRoom);
        const original = route[0];
        if (original && Math.hypot(entry.mesh.position.x - original.x, entry.mesh.position.z - original.z) < .03) {
          // Retain the partial boarding step when canceled mid-walk, rather than
          // trying to recover a seated position through the chair's footprint.
          let length = 0; const visited = [original];
          for (let i = 1; i < route.length; i++) {
            length += route[i].distanceTo(route[i - 1]);
            if (length > travelled) break;
            visited.push(route[i]);
          }
          points.push(...visited.reverse());
        } else {
          const origin = avatarWalkablePoint(factoryWorldPoint(anchor, stageRoom), false);
          const landing = avatarWalkablePoint(target, (entry.seatBlend ?? 0) > .01);
          const path = routeToStation(origin, landing);
          if (Math.hypot(path.at(-1)!.x - landing.x, path.at(-1)!.z - landing.z) < .01) {
            points.push(floorPoint(origin), ...path.map(floorPoint), new THREE.Vector3(entry.mesh.position.x,
              entry.mesh.position.y - entry.baseHeight, entry.mesh.position.z));
          }
        }
      }
      startWalk(points);
      entering = false; from = cameraPose(camera); started = performance.now(); lastProgress = -1;
    },
    update(now: number) {
      if (!active) return;
      // Live world updates continue underneath; the draft never edits the session.
      const entry = targetId ? agents.entries.get(targetId) : undefined;
      if (entry && entry.mesh !== hiddenMesh) { restore(); hide(entry); }
      if (hiddenMesh) hiddenMesh.visible = false;
      if (hiddenShadow) hiddenShadow.visible = false;
      walkAt(now);
      const w = canvas.clientWidth, h = Math.max(1, canvas.clientHeight), aspect = w / h;
      const resized = width !== w || height !== h;
      if (resized) {
        width = w; height = h; renderer.setSize(Math.min(1280, w), Math.min(1280, w) / aspect, false);
        const small = w < 680, span = small ? 2.55 : 2.75;
        focus.copy(route.at(-1) ?? anchor); focus.y += .43; aim.copy(focus);
        if (small) aim.y -= span * .27;
        else aim.x += (Math.min(380, w * .38) + 32) * span / h / 2;
        targetCamera.position.set(aim.x, aim.y + .48, aim.z + 3); targetCamera.lookAt(aim);
        destination.position.copy(targetCamera.position); destination.quaternion.copy(targetCamera.quaternion); destination.height = span;
        returning.height = room.height * h / roomHeight;
        key.position.set(focus.x - .55, focus.y + .6, focus.z + .85);
        fill.position.set(focus.x + .6, focus.y + .25, focus.z + .65);
      }
      // Let the actor clear the prop at room scale before settling the close-up.
      const delay = entering ? Math.max(0, walkDuration - 250) : 0;
      const progress = reduced.matches ? 1 : Math.max(0, Math.min(1, (now - started - delay) / 850));
      if (resized || progress !== lastProgress) blendCamera(camera, from, entering ? destination : returning, progress, aspect, focus);
      lastProgress = progress;
      const brightness = entering ? Math.min(1, (now - started) / 600) : 1 - progress;
      dimAmount = .62 * (reduced.matches ? entering ? 1 : 0 : brightness);
      key.intensity = brightness * 3.2; fill.intensity = brightness * 1.3;
      const facing = travelling ? travelDirection : direction;
      const row = !travelling && !walking && facing === 0 ? 0 : AVATAR_ANIMATIONS.indexOf(`walk_${['down', 'right', 'up', 'left'][facing]}`);
      // Preview the same stride at the normal two scene units per second.
      const frame = reduced.matches ? 0 : travelling ? Math.floor(travelled / AVATAR_FRAME_DISTANCE) % 4
        : walking ? Math.floor(Math.max(0, now - walkStarted) / 1000 * 2 / AVATAR_FRAME_DISTANCE) % 4 : 0;
      if (texture) setAvatarTextureFrame(texture, row, frame, avatarEyePose(now / 1000, 113, walking || travelling ? 'moving' : 'relaxed', reduced.matches));
      model.position.copy(anchor);
      model.position.y = floor + (sheet.feet[row][frame] / 32 - .5) * .86 + .004;
      if (!entering && progress === 1 && !travelling) finish();
    },
    dispose() { finish(); model.geometry.dispose(); material.dispose(); texture?.dispose(); dim.geometry.dispose(); dimMaterial.dispose(); },
  };
}
