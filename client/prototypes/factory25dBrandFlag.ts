import * as THREE from 'three';

import { PATIO_FLAG, createPatioFlagGeometry, createPatioFlagPole, patioFlagVertex } from './factory25dPatioFlagCloth';
export { patioFlagVertex as brandFlagVertex, createPatioFlagGeometry as createPersonalFlagGeometry } from './factory25dPatioFlagCloth';

export const BRAND_FLAG = {
  ...PATIO_FLAG, x: 20.7, z: -4.35,
  logo: '/brand/we-commerce-logomark-white.svg', logoAspect: 1,
} as const;

/** The original WE artwork on the same rectangular cloth as the Mist flag. */
export function createBrandFlag(parent: THREE.Scene | THREE.Group) {
  const root = new THREE.Group(); root.name = 'personal-we-patio-flag';
  root.position.set(BRAND_FLAG.x, 0, BRAND_FLAG.z); parent.add(root);
  const pole = createPatioFlagPole(); root.add(pole.root);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  function part(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The patio flag could not create its fabric texture');
  function paintFabric() {
    context!.fillStyle = '#101012'; context!.fillRect(0, 0, canvas.width, canvas.height);
    // Fine woven grain stays on the surface instead of sparkling in screen space.
    context!.fillStyle = 'rgba(202,210,220,.018)';
    for (let y = 1; y < canvas.height; y += 4) context!.fillRect(0, y, canvas.width, 1);
    context!.strokeStyle = 'rgba(160,169,182,.08)'; context!.lineWidth = 1;
    context!.setLineDash([3, 4]); context!.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    context!.setLineDash([]);
    // The original pole sits on the left; this reinforced hoist stays attached.
    context!.fillStyle = '#17191d'; context!.fillRect(0, 0, 10, canvas.height);
  }
  paintFabric();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  const fabric = new THREE.MeshStandardMaterial({ map: texture, roughness: .94, metalness: 0,
    side: THREE.DoubleSide }); materials.push(fabric);
  const geometry = createPatioFlagGeometry();
  const cloth = part(geometry, fabric, [BRAND_FLAG.width / 2 + .035, BRAND_FLAG.top - BRAND_FLAG.height / 2, 0]);
  cloth.name = 'personal-we-flag-cloth';
  // This anchor stays at the visual centre for a projected click label, even as
  // the cloth's individual triangles move. The cloth itself remains raycastable.
  const target = cloth;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute, uv = geometry.getAttribute('uv');
  position.setUsage(THREE.DynamicDrawUsage);
  let disposed = false, lastTick = -1, lastReduced: boolean | undefined;
  function update(elapsed: number, wind01: number, reducedMotion: boolean) {
    if (disposed) return;
    const time = reducedMotion ? 0 : (Number.isFinite(elapsed) ? elapsed : 0);
    const wind = reducedMotion ? 0 : THREE.MathUtils.clamp(Number.isFinite(wind01) ? wind01 : 0, 0, 1);
    const tick = reducedMotion ? 0 : Math.floor(time * BRAND_FLAG.fps);
    if (lastReduced === reducedMotion && tick === lastTick) return;
    lastTick = tick; lastReduced = reducedMotion;
    for (let i = 0; i < position.count; i++) {
      const p = patioFlagVertex(uv.getX(i), uv.getY(i), time, wind, reducedMotion);
      position.setXYZ(i, p.x, p.y, p.z);
    }
    position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  }
  const logo = document.createElement('img');
  logo.onload = () => {
    if (disposed) return;
    paintFabric();
    const aspect = logo.naturalWidth > 0 && logo.naturalHeight > 0 ? logo.naturalWidth / logo.naturalHeight : BRAND_FLAG.logoAspect;
    const width = Math.min(canvas.width * .7, canvas.height * .90 * aspect), height = width / aspect;
    context.drawImage(logo, (canvas.width - width) / 2 - canvas.width * .055, (canvas.height - height) / 2, width, height);
    texture.needsUpdate = true;
  };
  logo.src = BRAND_FLAG.logo;
  update(0, 0, false);
  return { root, target, update, dispose() {
    if (disposed) return; disposed = true;
    logo.onload = null; logo.removeAttribute('src');
    root.removeFromParent(); pole.dispose(); texture.dispose();
    for (const resource of [...geometries, ...materials]) resource.dispose();
  } };
}
