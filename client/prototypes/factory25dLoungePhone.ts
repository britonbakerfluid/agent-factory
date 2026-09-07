import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import type { CameraPose } from './factory25dCameraMotion';

export const PHONE = { width: .23, height: .446, screenWidth: .202, screenHeight: .376, faceZ: .016 };

export function phoneCameraPose(phone: THREE.Object3D, width: number, height: number): CameraPose {
  phone.updateWorldMatrix(true, false);
  const quaternion = phone.getWorldQuaternion(new THREE.Quaternion());
  const focus = phone.localToWorld(new THREE.Vector3(0, 0, PHONE.faceZ));
  const top = 36, bottom = 90;
  const availableHeight = Math.max(180, height - top - bottom);
  const availableWidth = Math.max(180, Math.min(440, width - 36));
  const span = Math.max(PHONE.height * height / availableHeight, PHONE.width * height / availableWidth);
  const position = focus.add(new THREE.Vector3(0, -(bottom - top) / height * span / 2, .7).applyQuaternion(quaternion));
  return { position, quaternion, height: span };
}

/** A phone resting beside the candle; local +Z is the glass facing upward. */
export function createLoungePhone(table: THREE.Group) {
  const phone = new THREE.Group(); phone.name = 'lounge-chat-phone';
  phone.position.set(-.22, .435, .025); phone.rotation.set(-Math.PI / 2, 0, -.12); table.add(phone);
  const rim = standard('#9299ad', .62), body = standard('#333545', .8);
  propPart(phone, [PHONE.width, PHONE.height - .024, .026], [0, 0, 0], body);
  propPart(phone, [PHONE.width - .024, PHONE.height, .026], [0, 0, 0], body);
  for (const x of [-1, 1]) propPart(phone, [.006, PHONE.height - .036, .019], [x * .114, 0, 0], rim);
  propPart(phone, [.008, .05, .014], [-.119, .08, 0], rim);
  propPart(phone, [.008, .037, .014], [.119, .062, 0], rim);
  const preview = document.createElement('canvas'); preview.width = 144; preview.height = 268;
  const texture = new THREE.CanvasTexture(preview); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PHONE.screenWidth, PHONE.screenHeight), material);
  face.position.z = PHONE.faceZ; phone.add(face);
  propPart(phone, [.044, .005, .002], [0, .207, .016], standard('#121721'));
  propPart(phone, [.007, .007, .002], [.038, .207, .016], standard('#384c62', .5));
  propPart(phone, [.053, .004, .002], [0, -.209, .016], rim);
  return { phone, preview, texture, dispose() {
    phone.removeFromParent(); phone.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose();
      if (Array.isArray(node.material)) node.material.forEach(mat => mat.dispose()); else node.material.dispose(); } }); texture.dispose();
  } };
}
