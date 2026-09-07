// Run from the repository root: node --import tsx scripts/audit-factory-geometry.mjs
// Counts source geometry, including live instance counts. This is not a GPU
// timing benchmark: camera culling, transparent passes and shadows are excluded.
import fs from 'node:fs';
import * as THREE from 'three';
import { createUtahLandscape } from '../client/prototypes/factory25dLandscape.ts';
import { createHouseplantFoliage } from '../client/prototypes/factory25dHouseplantFoliage.ts';
import { createHangingPothos } from '../client/prototypes/factory25dPothos.ts';
import { createPatioTerraces } from '../client/prototypes/factory25dPatioTerraces.ts';

// Contact-shadow textures are not relevant to triangle counts. No browser,
// network request, saved state or actual rendering is needed for this census.
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ({
  fillRect() {}, putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
}) }) };

function count(root) {
  const objects = [];
  root.traverseVisible(object => {
    if (!object.isMesh || object.isInstancedMesh && !object.count) return;
    const instances = object.isInstancedMesh ? object.count : 1;
    const geometry = object.geometry;
    objects.push({ name: object.name || geometry.type, instances,
      triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3 * instances,
      colorDraws: Array.isArray(object.material) ? geometry.groups.length : 1 });
  });
  return { triangles: objects.reduce((n, mesh) => n + mesh.triangles, 0),
    colorDraws: objects.reduce((n, mesh) => n + mesh.colorDraws, 0),
    largest: objects.sort((a, b) => b.triangles - a.triangles).slice(0, 8) };
}

function glb(name) {
  const data = fs.readFileSync(new URL(`../client/assets/prototype25d/${name}.glb`, import.meta.url));
  const document = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  const primitives = document.nodes.flatMap(node => node.mesh === undefined ? [] : document.meshes[node.mesh].primitives);
  return { triangles: primitives.reduce((count, primitive) => count + ((primitive.mode ?? 4) === 4
    ? document.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3 : 0), 0),
    colorDraws: primitives.length, kilobytes: Math.round(data.length / 1024), materials: document.materials.length };
}

const result = { scope: 'Source geometry, visible instances, dry weather; before camera culling and extra rendering passes.',
  models: {}, rooms: {} };
for (const car of ['mini', 'porsche', 'delorean', 'f1']) result.models[car] = glb(`garage/${car}`);
result.models.optionalBlenderTerrain = glb('utah-mountains');
const foliage = createHouseplantFoliage();
for (const kind of ['fern', 'palm', 'rubber', 'broad', 'calathea', 'bonsai', 'trailing']) {
  const plant = kind === 'bonsai' ? foliage.bonsai(1) : kind === 'trailing' ? foliage.trailing(1, true)
    : ['fern', 'palm'].includes(kind) ? foliage.fronds(kind, 1) : foliage.broadleaf(kind, 1);
  result.models[kind] = count(plant.group);
}
const hanging = new THREE.Scene(); createHangingPothos(hanging, 3.96);
result.models.hangingPothos = count(hanging);
result.rooms.windowLandscape = count(createUtahLandscape().group);
const patioRoom = new THREE.Group(), patio = createPatioTerraces(patioRoom, new THREE.MeshStandardMaterial());
patio.update(0, 0, false, 0, true, 16); result.rooms.patioNormal = count(patioRoom);
patio.update(0, 0, false, 0, true, 6.4); result.rooms.patioInspection = count(patioRoom);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
