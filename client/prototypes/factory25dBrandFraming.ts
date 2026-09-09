import * as THREE from 'three';
import type { CameraPose } from './factory25dCameraMotion';

/** Reserve the right-hand card on desktop and the lower sheet on narrow screens. */
export function brandFraming(width: number) {
  const narrow = width < 700;
  return narrow
    ? { x: .5, y: .25, width: .85, height: .36 }
    : { x: .27, y: .48, width: .43, height: .70 };
}

export function brandClosePose(focus: THREE.Vector3, rotation: THREE.Quaternion,
  size: THREE.Vector3, width: number, height: number): CameraPose {
  const frame = brandFraming(width), aspect = width / Math.max(1, height);
  const view = new THREE.PerspectiveCamera();
  // Orthographic framing is independent of camera distance. Keep the camera
  // behind the full visible floor so the near plane cannot slice the foreground.
  view.position.copy(focus).add(new THREE.Vector3(.35, .8, 3).multiplyScalar(10).applyQuaternion(rotation));
  view.up.set(0, 1, 0); view.lookAt(focus);
  const span = Math.max((size.y + size.z * .32) / frame.height,
    (size.x + size.z * .14) / (frame.width * aspect)) * 1.1;
  // Offset the camera, rather than the prop, to leave the physical shelf in place.
  view.position.add(new THREE.Vector3((.5 - frame.x) * span * aspect,
    (frame.y - .5) * span, 0).applyQuaternion(view.quaternion));
  return { position: view.position.clone(), quaternion: view.quaternion.clone(), height: span };
}
