import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import type { CameraPose } from './factory25dCameraMotion';
import { PhoneNotificationPulse } from './factory25dPhoneNotifications';

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
  const material = new THREE.MeshBasicMaterial({ map: texture, color: '#a9b7cd' });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PHONE.screenWidth, PHONE.screenHeight), material);
  face.position.z = PHONE.faceZ; phone.add(face);
  // The preview texture is mostly dark: multiplying it by white alone barely
  // reads at room scale. A low-opacity screen tint lights those dark pixels too.
  const arrivalTint = new THREE.MeshBasicMaterial({ color: '#78cfff', transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const litFace = new THREE.Mesh(new THREE.PlaneGeometry(PHONE.screenWidth - .004, PHONE.screenHeight - .004), arrivalTint);
  litFace.position.z = PHONE.faceZ + .0005; litFace.visible = false; phone.add(litFace);
  propPart(phone, [.044, .005, .002], [0, .207, .016], standard('#121721'));
  propPart(phone, [.007, .007, .002], [.038, .207, .016], standard('#384c62', .5));
  propPart(phone, [.053, .004, .002], [0, -.209, .016], rim);
  const glow = new THREE.PointLight('#78baff', 0, .9, 2);
  glow.position.set(0, 0, .075); glow.visible = false; phone.add(glow);
  // One tiny line draw for pixel-friendly cartoon vibration marks on both sides.
  const markVertices: number[] = [];
  for (const side of [-1, 1]) for (const x of [.158, .204]) {
    const points = [[x, -.07], [x + .024, -.04], [x + .024, .04], [x, .07]];
    for (let i = 1; i < points.length; i++) for (const point of [points[i - 1], points[i]])
      markVertices.push(side * point[0], point[1], .024);
  }
  const markGeometry = new THREE.BufferGeometry();
  markGeometry.setAttribute('position', new THREE.Float32BufferAttribute(markVertices, 3));
  const markMaterial = new THREE.LineBasicMaterial({ color: '#a8dded', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const marks = new THREE.LineSegments(markGeometry, markMaterial); marks.visible = false; phone.add(marks);
  const notification = new PhoneNotificationPulse(), idle = new THREE.Color('#a9b7cd'), lit = new THREE.Color('#ffffff');
  const home = phone.position.clone(), homeRotation = phone.rotation.clone();
  function updateNotification(now: number, reduced: boolean, visible: boolean) {
    if (!visible) notification.cancel();
    const state = notification.sample(now, reduced);
    material.color.copy(idle).lerp(lit, state.glow);
    arrivalTint.opacity = state.glow * .34; litFace.visible = state.glow > .001;
    glow.intensity = state.glow * 1.1; glow.visible = state.glow > .001;
    phone.position.set(home.x + state.offset, home.y + state.lift, home.z);
    phone.rotation.set(homeRotation.x, homeRotation.y + state.rock, homeRotation.z + state.twist);
    markMaterial.opacity = state.marks * .95; marks.visible = state.marks > .01;
    marks.scale.x = 1 + state.marks * .15;
    return state.active;
  }
  return { phone, preview, texture,
    notify: (now: number) => notification.trigger(now),
    updateNotification,
    dispose() {
    markGeometry.dispose(); markMaterial.dispose();
    phone.removeFromParent(); phone.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose();
      if (Array.isArray(node.material)) node.material.forEach(mat => mat.dispose()); else node.material.dispose(); } }); texture.dispose();
  } };
}
