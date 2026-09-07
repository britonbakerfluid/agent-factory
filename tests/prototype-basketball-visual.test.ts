import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { miniBall } from '../client/prototypes/factory25dBasketball';
import { basketballChannelDistance } from '../client/prototypes/factory25dBasketballVisual';
import { VISITOR_BALL_RADIUS } from '../shared/visitor-basketball';

describe('classic basketball surface', () => {
  it('has center crossings and bowed side channels, rather than three circular hoops', () => {
    // The side-view loops bend away from the center seam toward each pole;
    // front and back carry the same wrap, as on the reference product views.
    for (const side of [-1, 1]) for (const hemisphere of [-1, 1]) {
      const y = .45, x = side * .489579, z = hemisphere * .746869;
      // x²-y²=z²/15 at this point; it lies off every coordinate great circle.
      expect(basketballChannelDistance(new THREE.Vector3(x, y, z))).toBeLessThan(.00001);
    }
    expect(basketballChannelDistance(new THREE.Vector3(0, .6, .8))).toBe(0);
    expect(basketballChannelDistance(new THREE.Vector3(.6, 0, .8))).toBe(0);
    expect(basketballChannelDistance(new THREE.Vector3(.45, .2, .87))).toBeGreaterThan(.08);
  });

  it('divides the whole sphere into exactly eight connected rubber panels across the longitude wrap', () => {
    const width = 256, height = 128, panel = new Uint8Array(width * height), direction = new THREE.Vector3();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const latitude = Math.PI * (y + .5) / height, longitude = Math.PI * 2 * (x + .5) / width;
      direction.set(Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude));
      panel[y * width + x] = Number(basketballChannelDistance(direction) > .029);
    }
    const areas: number[] = [];
    for (let seed = 0; seed < panel.length; seed++) {
      if (!panel[seed]) continue;
      panel[seed] = 0; const queue = [seed];
      for (let index = 0; index < queue.length; index++) {
        const cell = queue[index], x = cell % width, y = Math.floor(cell / width);
        const neighbors = [y * width + (x + width - 1) % width, y * width + (x + 1) % width];
        if (y > 0) neighbors.push(cell - width); if (y < height - 1) neighbors.push(cell + width);
        for (const neighbor of neighbors) if (panel[neighbor]) { panel[neighbor] = 0; queue.push(neighbor); }
      }
      areas.push(queue.length);
    }
    expect(areas).toHaveLength(8);
    expect(Math.min(...areas)).toBeGreaterThan(width * height * .05);
  });

  it('keeps the existing collision radius and isolates ghost opacity from the other balls', () => {
    const room = new THREE.Group(), real = miniBall(room), ghost = miniBall(room);
    expect(real.children).toHaveLength(1); expect(ghost.children).toHaveLength(1);
    const surface = real.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    const ghostSurface = ghost.children[0] as typeof surface;
    const positions = surface.geometry.getAttribute('position'), point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      expect(point.fromBufferAttribute(positions, index).length()).toBeCloseTo(VISITOR_BALL_RADIUS, 6);
    }
    expect(surface.castShadow && surface.receiveShadow).toBe(true);
    expect(surface.material.roughness).toBeGreaterThan(.9);
    expect(surface.material.map).toBeNull(); // No per-ghost texture allocations to leak.
    expect(ghostSurface.material).not.toBe(surface.material);
    ghostSurface.material.transparent = true; ghostSurface.material.opacity = .28;
    expect(surface.material.opacity).toBe(1); expect(surface.material.transparent).toBe(false);
    for (const group of [real, ghost]) {
      group.removeFromParent(); group.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); node.material.dispose(); } });
    }
  });
});
