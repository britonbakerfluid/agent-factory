import * as THREE from 'three';

/** Shared with the whiteboard: gentle departure/arrival and even perceived scale. */
export function cameraEase(progress: number): number {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  height: number;
}

export function cameraPose(camera: THREE.OrthographicCamera): CameraPose {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    height: (camera.top - camera.bottom) / camera.zoom,
  };
}

const fromOffset = new THREE.Vector3(), toOffset = new THREE.Vector3();
const inverseRotation = new THREE.Quaternion();

/** Keep the subject on a direct screen-space path while approaching and turning.
 * Interpolating the camera position alone sends off-centre props on an arc,
 * amplified by the zoom. Instead, orbit the subject at its interpolated framing. */
export function blendCameraPose(
  camera: THREE.Camera,
  from: CameraPose,
  to: CameraPose,
  progress: number,
  focus?: THREE.Vector3,
) {
  const t = cameraEase(progress);
  const height = Math.exp(THREE.MathUtils.lerp(Math.log(from.height), Math.log(to.height), t));
  camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
  if (focus) {
    fromOffset.copy(focus).sub(from.position).applyQuaternion(inverseRotation.copy(from.quaternion).invert());
    toOffset.copy(focus).sub(to.position).applyQuaternion(inverseRotation.copy(to.quaternion).invert());
    fromOffset.set(
      THREE.MathUtils.lerp(fromOffset.x / from.height, toOffset.x / to.height, t) * height,
      THREE.MathUtils.lerp(fromOffset.y / from.height, toOffset.y / to.height, t) * height,
      THREE.MathUtils.lerp(fromOffset.z, toOffset.z, t),
    );
    camera.position.copy(focus).sub(fromOffset.applyQuaternion(camera.quaternion));
  } else camera.position.lerpVectors(from.position, to.position, t);
  return height;
}

export function blendCamera(
  camera: THREE.OrthographicCamera,
  from: CameraPose,
  to: CameraPose,
  progress: number,
  aspect: number,
  focus?: THREE.Vector3,
) {
  const height = blendCameraPose(camera, from, to, progress, focus);
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
