import { createInteractionGlow } from './factory25dInteractionGlow';
import * as THREE from 'three';
import { SoccerJuggle } from './factory25dSoccerMotion';
import { SoccerTravel } from './factory25dSoccerTravel';
import './factory25dSoccer.css';

/** The button tracks the rendered ball, so the same tap works on the floor and in midair. */
export function createSoccerInteraction(ball: THREE.Mesh, shadow: THREE.Mesh,
  canvas: HTMLCanvasElement) {
  const host = canvas.parentElement!, abort = new AbortController();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'lounge-soccer-ball'; button.hidden = true;
  button.setAttribute('aria-label', 'Soccer ball');
  button.setAttribute('aria-description', 'Drag to move. Flick and release to kick. Arrow keys aim; space kicks. Click to juggle.');
  button.title = 'drag to move · flick to kick · click to juggle';
  host.append(button);
  const glow = createInteractionGlow(ball, button);
  const motion = new SoccerJuggle(), rest = ball.position.clone(), rotation = ball.rotation.clone();
  const originalShadow = shadow.material as THREE.MeshBasicMaterial;
  const shadowMaterial = originalShadow.clone(); shadow.material = shadowMaterial;
  const shadowScale = shadow.scale.clone();
  const shadowRest = shadow.position.clone();
  const point = new THREE.Vector3(), edge = new THREE.Vector3(), cameraRight = new THREE.Vector3(), worldScale = new THREE.Vector3();
  ball.getWorldPosition(point);
  const travel = new SoccerTravel(point.x, point.z);
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const pointerPoint = new THREE.Vector3(), offset = new THREE.Vector3(), direction = new THREE.Vector2(0, -1);
  let view: THREE.Camera | undefined, suppressClickUntil = 0;
  let available = false, reduced = false, previousTime: number | undefined;
  let down: { id: number; x: number; y: number; dragging: boolean } | undefined;
  let samples: { x: number; z: number; time: number }[] = [];
  function pick(x: number, y: number) {
    if (!view) return false;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1, 1-(y-r.top)/r.height*2), view);
    return !!ray.ray.intersectPlane(plane, pointerPoint);
  }
  function sample(time: number) {
    samples.push({x: travel.x, z: travel.z, time});
    samples = samples.filter(s => time - s.time <= 120).slice(-16);
  }
  function cancel() {
    const pointer = down?.id; down = undefined; samples = []; delete button.dataset.dragging;
    if (pointer !== undefined && button.hasPointerCapture?.(pointer)) button.releasePointerCapture(pointer);
  }
  ball.name = 'lounge-soccer-ball';
  button.addEventListener('pointerdown', event => {
    if (!available || down || event.button !== 0) return;
    event.preventDefault();
    ball.getWorldPosition(point); plane.constant = -point.y;
    if (!pick(event.clientX, event.clientY)) return;
    offset.copy(point).sub(pointerPoint);
    down = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    button.setPointerCapture(event.pointerId); button.focus({preventScroll: true});
    event.stopPropagation();
  }, { signal: abort.signal });
  button.addEventListener('pointermove', event => {
    if (!down || down.id !== event.pointerId || !available) return;
    event.preventDefault(); event.stopPropagation();
    if (!down.dragging && Math.hypot(event.clientX-down.x, event.clientY-down.y) <= 6) return;
    if (!pick(event.clientX, event.clientY)) return;
    if (!down.dragging) { motion.reset(); motion.height = reduced ? .18 : .35; travel.stop(); down.dragging = true; button.dataset.dragging = 'true'; }
    travel.place(pointerPoint.x + offset.x, pointerPoint.z + offset.z); sample(event.timeStamp);
  }, { signal: abort.signal });
  button.addEventListener('pointerup', event => {
    if (!down || down.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); suppressClickUntil = performance.now() + 400;
    if (available && down.dragging) {
      sample(event.timeStamp);
      const first = samples[0], last = samples.at(-1)!, dt = (last.time-first.time)/1000;
      travel.release(dt > .008 ? (last.x-first.x)/dt : 0, dt > .008 ? (last.z-first.z)/dt : 0, reduced);
      if (travel.moving) motion.kick(reduced);
    } else if (available) motion.kick(reduced);
    button.dataset.touches = String(motion.touches); cancel();
  }, { signal: abort.signal });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (!available || (event.detail > 0 && performance.now() < suppressClickUntil)) return;
    motion.kick(reduced);
    button.dataset.touches = String(motion.touches);
  }, { signal: abort.signal });
  button.addEventListener('keydown', event => {
    if (!available) return;
    const aim: Record<string, [number, number]> = {ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1]};
    if (aim[event.key]) { event.preventDefault(); event.stopPropagation(); direction.set(...aim[event.key]); }
    else if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); if (event.repeat || down) return;
      travel.release(direction.x * 5, direction.y * 5, reduced); motion.kick(reduced); button.dataset.touches = String(motion.touches);
    }
  }, { signal: abort.signal });
  button.addEventListener('pointercancel', cancel, { signal: abort.signal });
  button.addEventListener('lostpointercapture', cancel, { signal: abort.signal });
  return {
    update(time: number, reduceMotion: boolean, camera: THREE.Camera, visible: boolean) {
      const dt = previousTime === undefined ? 0 : time - previousTime; previousTime = time;
      reduced = reduceMotion; view = camera;
      available = visible && !document.hidden
        && !document.body.matches('.avatar-editor-open, .inspect-open, .chat-open, .team-open');
      if (!available) { cancel(); motion.reset(); travel.stop(); }
      else if (!down?.dragging) { motion.update(dt, reduced); travel.update(dt, motion.airborne); }
      ball.getWorldPosition(point); point.x = travel.x; point.z = travel.z;
      ball.parent?.worldToLocal(point); ball.position.x = point.x; ball.position.z = point.z;
      ball.position.y = rest.y + motion.height;
      ball.rotation.set(rotation.x + motion.spin + (reduced ? 0 : (ball.position.z - rest.z) / .14), rotation.y + motion.spin * .3, rotation.z - (reduced ? 0 : (ball.position.x - rest.x) / .14));
      shadow.position.x = shadowRest.x + ball.position.x - rest.x;
      shadow.position.z = shadowRest.z + ball.position.z - rest.z;
      shadow.scale.copy(shadowScale).multiplyScalar(1 + motion.height * .48);
      // The footprint stays on the floor, getting softer and lighter with height.
      shadowMaterial.opacity = originalShadow.opacity / (1 + motion.height * 2.2);
      button.dataset.airborne = String(motion.airborne); button.dataset.moving = String(travel.moving);
      button.hidden = !available;
      if (!available) return;
      camera.updateMatrixWorld(); ball.updateWorldMatrix(true, false);
      const rect = canvas.getBoundingClientRect(), parent = host.getBoundingClientRect();
      ball.getWorldPosition(point);
      cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
      const worldRadius = .14 * ball.getWorldScale(worldScale).x;
      edge.copy(point).addScaledVector(cameraRight, worldRadius).project(camera);
      point.project(camera);
      button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      if (button.hidden) return;
      const size = Math.max(44, Math.abs(edge.x - point.x) * rect.width + 12);
      button.style.width = button.style.height = `${size}px`;
      button.style.left = `${rect.left - parent.left + (point.x + 1) * rect.width / 2 - size / 2}px`;
      button.style.top = `${rect.top - parent.top + (1 - point.y) * rect.height / 2 - size / 2}px`;
    },
    dispose() {
      glow.dispose(); cancel(); abort.abort(); button.remove();
      shadow.material = originalShadow; shadowMaterial.dispose(); shadow.scale.copy(shadowScale);
      shadow.position.copy(shadowRest);
      ball.position.copy(rest); ball.rotation.copy(rotation);
    },
  };
}
