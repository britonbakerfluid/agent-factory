import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPothosLeafGeometry } from '../client/prototypes/factory25dPothosFoliage';
import { createHangingPothos } from '../client/prototypes/factory25dPothos';
import { createPatioGarden } from '../client/prototypes/factory25dPatioGarden';

afterEach(() => vi.unstubAllGlobals());
function canvasStub() {
  vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => ({
    fillRect() {}, putImageData() {}, createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }) }) });
}

describe('foliage detail budget', () => {
  it('keeps distant leaves solid and their front/back surfaces aligned with the original attached veins', () => {
    const full = createPothosLeafGeometry(), distant = createPothosLeafGeometry(false);
    full.computeBoundingBox(); distant.computeBoundingBox();
    expect(full.getAttribute('position').count / 3).toBe(76);
    expect(distant.getAttribute('position').count / 3).toBe(36);
    expect(distant.boundingBox!.min.z).toBeCloseTo(full.boundingBox!.min.z, 7);
    expect(distant.boundingBox!.max.z).toBeCloseTo(full.boundingBox!.max.z, 7);
    for (const axis of ['x', 'y'] as const) for (const side of ['min', 'max'] as const) {
      // Smaller than half a render pixel at the normal room scale.
      expect(Math.abs(full.boundingBox![side][axis] - distant.boundingBox![side][axis])).toBeLessThan(.01);
    }
    const points = distant.getAttribute('position'), edges = new Map<string, number>();
    const point = (i: number) => [points.getX(i), points.getY(i), points.getZ(i)].map(n => n.toFixed(6)).join(',');
    for (let i = 0; i < points.count; i += 3) for (let edge = 0; edge < 3; edge++) {
      const key = [point(i + edge), point(i + (edge + 1) % 3)].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    full.dispose(); distant.dispose();
  });

  it('restores full leaves and snow at inspection scale without changing foliage placement or colour', () => {
    canvasStub();
    const root = new THREE.Group(), garden = createPatioGarden(root);
    garden.border(0, 0, 0, 2, 1); garden.finish();
    const leaves = root.getObjectByName('Planter pothos leaves') as THREE.InstancedMesh;
    const snow = root.getObjectByName('Snow on planter leaves') as THREE.InstancedMesh;
    const veins = root.getObjectByName('Planter pothos veins') as THREE.InstancedMesh;
    const full = leaves.geometry, veinGeometry = veins.geometry, material = leaves.material;
    const poses = [...leaves.instanceMatrix.array], colors = [...leaves.instanceColor!.array], count = leaves.count;
    garden.update(0, 0, 0, false, 16);
    const distant = leaves.geometry;
    expect(distant).not.toBe(full); expect(snow.geometry).toBe(distant); expect(snow.visible).toBe(false);
    for (const width of [11.9, 10.2, 10.8]) { garden.update(0, 0, 0, false, width); expect(leaves.geometry).toBe(distant); }
    garden.update(.7, 0, 0, false, 6.4);
    expect(leaves.geometry).toBe(full); expect(snow.geometry).toBe(full); expect(snow.visible).toBe(true);
    for (const width of [10.2, 11.8, 10.9]) { garden.update(0, 0, 0, false, width); expect(leaves.geometry).toBe(full); }
    expect([...leaves.instanceMatrix.array]).toEqual(poses); expect([...leaves.instanceColor!.array]).toEqual(colors);
    expect(leaves.count).toBe(count); expect(leaves.material).toBe(material); expect(veins.geometry).toBe(veinGeometry);
    const release = vi.spyOn(distant, 'dispose'); garden.dispose(); expect(release).toHaveBeenCalledOnce();
  });

  it('draws the canonical hanging plant in 24 batches while retaining every solid leaf, vein and shadow', () => {
    const root = new THREE.Scene(), plant = createHangingPothos(root, 3.96);
    let triangles = 0, draws = 0, leafCount = 0, veinCount = 0;
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      draws++;
      triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3
        * (node instanceof THREE.InstancedMesh ? node.count : 1);
      expect(node.castShadow && node.receiveShadow).toBe(true);
      if (node instanceof THREE.InstancedMesh) {
        if (node.geometry.type === 'ExtrudeGeometry') { leafCount += node.count; expect(node.instanceColor).not.toBeNull(); }
        else veinCount += node.count;
      }
    });
    expect({ triangles, draws, leafCount, veinCount }).toEqual({ triangles: 5568, draws: 24, leafCount: 54, veinCount: 54 });
    plant.update(5, false); root.updateMatrixWorld(true);
    const positions = root.children[0].children.map(node => node.position.clone());
    plant.update(5, true); root.updateMatrixWorld(true);
    root.children[0].children.forEach((node, i) => { expect(node.position.equals(positions[i])).toBe(true); expect(node.rotation.z).toBe(0); });
  });
});
