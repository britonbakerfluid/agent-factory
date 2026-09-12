import * as THREE from 'three';

export function pickupHoop(mesh: THREE.Object3D) {
  let root = mesh; while (root.parent) root = root.parent;
  return root.getObjectByName('agent-dunk-rim');
}

/** The hanging body can be well below the cursor after the shirt stretches.
 * Catch either an intentional cursor drop or the rendered body over the rim. */
export function updatePickupHoopTarget(mesh: THREE.Mesh, camera: THREE.Camera, canvas: HTMLCanvasElement, pointer: { x: number; y: number }) {
  delete mesh.userData.pickupDunkRim;
  if ((mesh.userData.room ?? 'factory') !== 'factory') return;
  const hoop = pickupHoop(mesh); if (!hoop) return;
  const rect = canvas.getBoundingClientRect(), rim = hoop.getWorldPosition(new THREE.Vector3());
  const screen = rim.clone().project(camera), edge = rim.clone().add(new THREE.Vector3(.48, 0, 0)).project(camera);
  const radius = Math.max(18, Math.abs(edge.x - screen.x) * rect.width / 2);
  const x = rect.left + (screen.x + 1) * rect.width / 2, y = rect.top + (1 - screen.y) * rect.height / 2;
  const body = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
  const bodyX = rect.left + (body.x + 1) * rect.width / 2, bodyY = rect.top + (1 - body.y) * rect.height / 2;
  const cursorOver = Math.abs(pointer.x - x) < radius && pointer.y - y > -radius * 2 && pointer.y - y < radius * .7;
  const bodyOver = Math.abs(bodyX - x) < radius && bodyY - y > -radius * 3 && bodyY - y < radius * .7;
  if (cursorOver || bodyOver) mesh.userData.pickupDunkRim = mesh.parent!.worldToLocal(rim);
}

/** Reuse the real rim/net reaction, including for people watching a shared drop. */
export function reactToPickupDunk(mesh: THREE.Mesh) {
  pickupHoop(mesh)?.userData.onAgentDunk?.();
}
