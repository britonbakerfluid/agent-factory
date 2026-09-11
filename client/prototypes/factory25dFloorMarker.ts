import * as THREE from 'three';

/** Shared floor circle for choosing and matching basketball shot positions. */
export function createBasketballFloorMarker(parent: THREE.Object3D) {
  const material = new THREE.MeshBasicMaterial({ color: '#f1efe4', transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.23, .25, 40), material);
  ring.rotation.x = -Math.PI / 2; ring.position.y = .012; ring.renderOrder = 1; ring.visible = false;
  parent.add(ring); return ring;
}
