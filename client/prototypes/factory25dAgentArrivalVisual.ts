import * as THREE from 'three';
import type { AgentArrivalPose } from './factory25dAgentArrival';

/** Six crisp floor flecks and a grounded shadow sell the landing at room scale. */
export function createAgentArrivalVisual(shadow: THREE.Mesh) {
  const original = shadow.material as THREE.MeshBasicMaterial, scale = shadow.scale.clone();
  const material = original.clone(); shadow.material = material;
  const dustMaterial = new THREE.MeshBasicMaterial({ color: '#b4b5b4', transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false });
  const geometry = new THREE.BoxGeometry(.045, .025, .045);
  const dust = new THREE.InstancedMesh(geometry, dustMaterial, 6);
  dust.name = 'agent-arrival-landing'; dust.visible = false;
  const matrix = new THREE.Object3D();
  return {
    update(pose: AgentArrivalPose) {
      shadow.scale.copy(scale).multiplyScalar(pose.shadowScale);
      material.opacity = original.opacity * pose.shadowOpacity;
      if (dust.parent !== shadow.parent) shadow.parent?.add(dust);
      dust.position.copy(shadow.position); dust.visible = pose.impact !== undefined;
      if (pose.impact === undefined) return;
      const p = pose.impact;
      dustMaterial.opacity = .36 * (1 - p) ** 1.5;
      for (let index = 0; index < 6; index++) {
        const angle = index / 6 * Math.PI * 2;
        const radius = .07 + p * (.2 + index % 2 * .055);
        matrix.position.set(Math.cos(angle) * radius, .017 + Math.sin(p * Math.PI) * .025, Math.sin(angle) * radius * .55);
        matrix.scale.setScalar(1 - p * .6); matrix.updateMatrix(); dust.setMatrixAt(index, matrix.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      shadow.material = original; shadow.scale.copy(scale); material.dispose();
      dust.removeFromParent(); dust.dispose(); geometry.dispose(); dustMaterial.dispose();
    },
  };
}
