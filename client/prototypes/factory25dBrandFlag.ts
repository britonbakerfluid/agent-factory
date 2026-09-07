import * as THREE from 'three';

export const BRAND_FLAG = {
  x: 20.7, z: -4.06, poleHeight: 3.2,
  width: 1.75, height: 1.75 * 69.5 / 113, top: 3.08,
  logo: '/brand/we-commerce-logomark-white.svg', logoAspect: 1,
  notch: 14 / 113,
} as const;

/** From the user's flags/index.html: the same smooth, non-repeating gust signal. */
export function flagPseudoNoise(t: number, seed: number) {
  return Math.sin(t * .71 + seed * .3) * .45
    + Math.sin(t * 1.31 + seed * 1.7 + 1.3) * .3
    + Math.sin(t * 2.07 + seed * .9 + 2.7) * .18;
}

/** Original waveOffset/warpPoint, in scene metres, with depth added for real cloth. */
export function brandFlagVertex(u: number, v: number, elapsed: number, wind01: number, reducedMotion: boolean) {
  const wind = reducedMotion ? 0 : THREE.MathUtils.clamp(Number.isFinite(wind01) ? wind01 : 0, 0, 1);
  const time = reducedMotion ? 0 : (Number.isFinite(elapsed) ? elapsed : 0);
  const sourceV = 1 - v, edgeBias = sourceV * .6;
  const variance = .25 + wind * .75, speed = .75 + wind * .65;
  const phase = u * Math.PI * 2 - time * speed * Math.PI * 2;
  const phaseWobble = variance * 1.6 * flagPseudoNoise(time * .5, u * 3 + edgeBias);
  const primary = Math.sin(phase + phaseWobble + edgeBias);
  const gust = 1 + variance * .9 * flagPseudoNoise(time * .7, 0);
  const jitter = variance * .55 * flagPseudoNoise(time * 1.5, u * 6 + edgeBias);
  const amplitude = reducedMotion ? 0 : 3 + wind * 6;
  const wave = (primary + jitter) * amplitude * u * u * gust;
  const restDroop = -u * 3 * (1 - sourceV) + u * 4 * sourceV;
  const curl = 6 * Math.sin(phase - .6) * u * u * u;
  const scale = BRAND_FLAG.width / 113;
  return {
    x: (u - .5) * BRAND_FLAG.width + curl * scale,
    y: (v - .5) * BRAND_FLAG.height - (wave + restDroop) * scale,
    z: wave * scale * .38 + Math.cos(phase - .6) * u * u * (reducedMotion ? .018 : .045),
  };
}

/** The notch is missing geometry, including its shadow and clickable outline. */
export function createPersonalFlagGeometry() {
  const columns = 28, rows = 12, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = 1 - row / rows;
    const freeEdge = 1 - BRAND_FLAG.notch * (1 - Math.abs(v * 2 - 1));
    for (let col = 0; col <= columns; col++) {
      const rest = col / columns;
      // Retain straight UVs across the logo; only the final quarter narrows to
      // the original notch. This avoids stretching a rectangle into a chevron.
      const u = rest <= .75 ? rest : .75 + (rest - .75) * 4 * (freeEdge - .75);
      positions.push((u - .5) * BRAND_FLAG.width, (v - .5) * BRAND_FLAG.height, 0);
      uvs.push(u, v);
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** The user's black WE swallowtail flag, adapted from their original flag project. */
export function createBrandFlag(parent: THREE.Scene | THREE.Group) {
  const root = new THREE.Group(); root.name = 'personal-we-patio-flag';
  root.position.set(BRAND_FLAG.x, 0, BRAND_FLAG.z); parent.add(root);
  const metal = new THREE.MeshStandardMaterial({ color: '#111319', roughness: .75, metalness: .18 });
  const rope = new THREE.MeshStandardMaterial({ color: '#292b30', roughness: 1 });
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [metal, rope];
  function part(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  part(new THREE.CylinderGeometry(.032, .044, BRAND_FLAG.poleHeight, 8), metal, [0, BRAND_FLAG.poleHeight / 2, 0]);
  part(new THREE.BoxGeometry(.18, .12, .18), metal, [0, .06, 0]);
  part(new THREE.CylinderGeometry(.053, .055, .28, 8), metal, [0, .2, 0]);
  part(new THREE.SphereGeometry(.070, 8, 6), metal, [0, BRAND_FLAG.poleHeight + .015, 0]);
  part(new THREE.CylinderGeometry(.006, .006, 2.38, 4), rope, [.039, 1.78, .02]);
  for (const y of [BRAND_FLAG.top - .04, BRAND_FLAG.top - BRAND_FLAG.height + .04]) {
    const tie = part(new THREE.TorusGeometry(.037, .008, 4, 8), rope, [0, y, 0]); tie.rotation.x = Math.PI / 2;
  }

  const canvas = document.createElement('canvas'); canvas.width = 678; canvas.height = 417;
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
  const fabric = new THREE.MeshStandardMaterial({ map: texture, roughness: .98, metalness: 0,
    side: THREE.DoubleSide, flatShading: true }); materials.push(fabric);
  const geometry = createPersonalFlagGeometry();
  const cloth = part(geometry, fabric, [BRAND_FLAG.width / 2 + .035, BRAND_FLAG.top - BRAND_FLAG.height / 2, 0]);
  cloth.name = 'personal-we-flag-cloth';
  // This anchor stays at the visual centre for a projected click label, even as
  // the cloth's individual triangles move. The cloth itself remains raycastable.
  const target = cloth;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute, uv = geometry.getAttribute('uv');
  position.setUsage(THREE.DynamicDrawUsage);
  let disposed = false, lastTime = -Infinity, lastWind = -1, lastReduced: boolean | undefined;
  function update(elapsed: number, wind01: number, reducedMotion: boolean) {
    if (disposed) return;
    const time = reducedMotion ? 0 : (Number.isFinite(elapsed) ? elapsed : 0);
    const wind = reducedMotion ? 0 : THREE.MathUtils.clamp(Number.isFinite(wind01) ? wind01 : 0, 0, 1);
    if (lastReduced === reducedMotion && Math.abs(time - lastTime) < 1 / 30 && Math.abs(wind - lastWind) < .001) return;
    lastTime = time; lastWind = wind; lastReduced = reducedMotion;
    for (let i = 0; i < position.count; i++) {
      const p = brandFlagVertex(uv.getX(i), uv.getY(i), time, wind, reducedMotion);
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
    root.removeFromParent(); texture.dispose();
    for (const resource of [...geometries, ...materials]) resource.dispose();
  } };
}
