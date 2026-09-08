import * as THREE from 'three';
import { SoccerJuggle } from './factory25dSoccerMotion';
import './factory25dSoccer.css';

/** The button tracks the rendered ball, so the same tap works on the floor and in midair. */
export function createSoccerInteraction(ball: THREE.Mesh, shadow: THREE.Mesh,
  canvas: HTMLCanvasElement) {
  const host = canvas.parentElement!, abort = new AbortController();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'lounge-soccer-ball'; button.hidden = true;
  button.setAttribute('aria-label', 'Juggle soccer ball');
  button.title = 'click to kick · keep clicking the ball to juggle';
  host.append(button);
  const motion = new SoccerJuggle(), rest = ball.position.clone(), rotation = ball.rotation.clone();
  const originalShadow = shadow.material as THREE.MeshBasicMaterial;
  const shadowMaterial = originalShadow.clone(); shadow.material = shadowMaterial;
  const shadowScale = shadow.scale.clone();
  const point = new THREE.Vector3(), edge = new THREE.Vector3(), cameraRight = new THREE.Vector3(), worldScale = new THREE.Vector3();
  let available = false, reduced = false, previousTime: number | undefined;
  let down: { x: number; y: number } | undefined;
  ball.name = 'lounge-soccer-ball';
  button.addEventListener('pointerdown', event => {
    down = { x: event.clientX, y: event.clientY };
    event.stopPropagation();
  }, { signal: abort.signal });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (!available || (event.detail > 0 && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6)) return;
    motion.kick(reduced);
    button.dataset.touches = String(motion.touches);
  }, { signal: abort.signal });
  button.addEventListener('pointercancel', () => { down = undefined; }, { signal: abort.signal });
  return {
    update(time: number, reduceMotion: boolean, camera: THREE.Camera, visible: boolean) {
      const dt = previousTime === undefined ? 0 : time - previousTime; previousTime = time;
      reduced = reduceMotion;
      available = visible && !document.hidden
        && !document.body.matches('.avatar-editor-open, .inspect-open, .chat-open, .team-open');
      if (!available) motion.reset(); else motion.update(dt, reduced);
      ball.position.y = rest.y + motion.height;
      ball.rotation.set(rotation.x + motion.spin, rotation.y + motion.spin * .3, rotation.z);
      shadow.scale.copy(shadowScale).multiplyScalar(1 + motion.height * .48);
      // The footprint stays on the floor, getting softer and lighter with height.
      shadowMaterial.opacity = originalShadow.opacity / (1 + motion.height * 2.2);
      button.dataset.airborne = String(motion.airborne);
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
      abort.abort(); button.remove();
      shadow.material = originalShadow; shadowMaterial.dispose(); shadow.scale.copy(shadowScale);
      ball.position.copy(rest); ball.rotation.copy(rotation);
    },
  };
}
