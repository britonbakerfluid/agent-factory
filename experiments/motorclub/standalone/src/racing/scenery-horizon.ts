import * as THREE from "three";

/** Inexpensive faceted ridges continue the valley past the finite Blender terrain. */
export function createHorizon() {
  const geometry = new THREE.BufferGeometry(), positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const sectors = 96, radii = [325, 470, 620, 790, 1020];
  const palette = ["#50684f", "#4d6659", "#566f73", "#647e95", "#8299bd"].map(c => new THREE.Color(c));
  const color = new THREE.Color();
  for (let ring = 0; ring < radii.length; ring++) {
    for (let i = 0; i <= sectors; i++) {
      const angle = i / sectors * Math.PI * 2;
      const ridge = 0.5 + 0.23 * Math.sin(angle * 7 + ring * 1.7) + 0.17 * Math.cos(angle * 11 - ring * 0.8) + 0.1 * Math.sin(angle * 19);
      const radius = radii[ring] * (1 + 0.045 * Math.sin(angle * 5));
      const height = ring === 0 ? -16 : -14 + ridge * [0, 110, 160, 135, 65][ring];
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius - 100);
      color.copy(palette[ring]).multiplyScalar(0.91 + ridge * 0.16);
      colors.push(color.r, color.g, color.b);
      if (ring && i < sectors) {
        const k = ring * (sectors + 1) + i, prior = k - sectors - 1;
        indices.push(prior, prior + 1, k, prior + 1, k + 1, k);
      }
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, flatShading: true}));
  mesh.name = "layered-mountain-horizon";
  return mesh;
}
