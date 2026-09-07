import * as THREE from 'three';

/** Both patio flags use the same fabric, mounting and weather clock. */
export const PATIO_FLAG = {
  width: 1.2, height: 1.2 * 9 / 16,
  top: 2.73, poleHeight: 2.85, fps: 15, columns: 32, rows: 14,
} as const;

/** Integrate each strip's tangent so folds shorten the silhouette without
 * stretching the cloth. The full hoist stays pinned to the pole. */
export function patioFlagVertex(u: number, v: number, elapsed: number, wind01: number, reduced: boolean) {
  const wind = reduced ? .25 : THREE.MathUtils.clamp(Number.isFinite(wind01) ? wind01 : 0, 0, 1);
  const t = reduced ? 0 : Math.floor((Number.isFinite(elapsed) ? elapsed : 0) * PATIO_FLAG.fps) / PATIO_FLAG.fps;
  const phase = t * (1.5 + wind * .8);
  const segments = Math.max(1, Math.ceil(u * PATIO_FLAG.columns));
  const length = u * PATIO_FLAG.width / segments;
  let x = -PATIO_FLAG.width / 2, z = 0;
  for (let i = 0; i < segments; i++) {
    const s = u * (i + .5) / segments;
    const bend = (1 - Math.exp(-s * 7)) * (.55 + wind * .32);
    const angle = bend * Math.sin(s * 8.4 - phase + (v - .5) * .8)
      + s * .13 * Math.sin(phase * .43);
    x += Math.cos(angle) * length; z += Math.sin(angle) * length;
  }
  const scale = PATIO_FLAG.width / 1.75;
  const sag = Math.pow(u, 1.5) * (.055 + (1 - wind) * .075) * (1.2 - v * .45) * scale;
  return { x, y: (v - .5) * PATIO_FLAG.height - sag + Math.sin(u * 7 - phase) * u * .025 * scale * (1 - v), z };
}

export function createPatioFlagGeometry() {
  const geometry = new THREE.PlaneGeometry(PATIO_FLAG.width, PATIO_FLAG.height, PATIO_FLAG.columns, PATIO_FLAG.rows);
  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  return geometry;
}

export function createPatioFlagPole() {
  const root = new THREE.Group(); root.name = 'silver-patio-flagpole';
  const metal = new THREE.MeshStandardMaterial({ color: '#b9c5ce', roughness: .32, metalness: .45 });
  const geometries: THREE.BufferGeometry[] = [];
  function part(geometry: THREE.BufferGeometry, y: number) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, metal); mesh.position.y = y;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  part(new THREE.CylinderGeometry(.025, .033, PATIO_FLAG.poleHeight, 8), PATIO_FLAG.poleHeight / 2);
  part(new THREE.BoxGeometry(.16, .10, .16), .05);
  part(new THREE.SphereGeometry(.048, 8, 6), PATIO_FLAG.poleHeight + .012);
  for (const y of [PATIO_FLAG.top - .025, PATIO_FLAG.top - PATIO_FLAG.height + .025]) {
    part(new THREE.TorusGeometry(.031, .006, 4, 8), y).rotation.x = Math.PI / 2;
  }
  return { root, dispose() { root.removeFromParent(); metal.dispose(); for (const geometry of geometries) geometry.dispose(); } };
}
