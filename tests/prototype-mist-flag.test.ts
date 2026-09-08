import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createMistClothGeometry, MIST_FLAG, MIST_INK_WINDOW, mistCanvasPoint, mistClothVertex } from '../client/prototypes/factory25dMistCloth';

describe('Mist cloth', () => {
  it('pins every point along the hoist through gusts', () => {
    for (const time of [0, .2, 1.4, 8, 1000]) for (const v of [0, .2, .5, 1]) {
      expect(mistClothVertex(0, v, time, 1, false)).toEqual({ x: -MIST_FLAG.width / 2, y: (v - .5) * MIST_FLAG.height, z: 0 });
    }
  });

  it('creates depth by folding fabric while preserving strip length and patio clearance', () => {
    for (const time of [0, .5, 1, 2.3, 4, 7.5, 11]) for (const v of [0, .5, 1]) {
      const points = Array.from({ length: 33 }, (_, i) => new THREE.Vector3().copy(mistClothVertex(i / 32, v, time, 1, false)));
      const length = points.slice(1).reduce((sum, point, i) => sum + point.distanceTo(points[i]), 0);
      expect(length).toBeCloseTo(MIST_FLAG.width, 2);
      expect(points[32].x - points[0].x).toBeLessThan(MIST_FLAG.width - .03);
      expect(Math.max(...points.map(p => Math.abs(p.z)))).toBeGreaterThan(.07);
      for (const p of points) expect(MIST_FLAG.z + p.z).toBeLessThan(-3.65); // string lights are at -3.6
    }
  });

  it('holds cloth at 15 fps and freezes a shaped rest pose for reduced motion', () => {
    expect(mistClothVertex(.7, .3, .21, .6, false)).toEqual(mistClothVertex(.7, .3, .25, .6, false));
    expect(mistClothVertex(.7, .3, .3, .6, false)).not.toEqual(mistClothVertex(.7, .3, .25, .6, false));
    expect(mistClothVertex(.8, 0, 1, 0, true)).toEqual(mistClothVertex(.8, 0, 900, 1, true));
  });

  it('maps deformed mesh hits to the same authored ink pixels from either face', () => {
    const geometry = createMistClothGeometry(), positions = geometry.getAttribute('position'), uvs = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const p = mistClothVertex(uvs.getX(i), uvs.getY(i), 2, .7, false); positions.setXYZ(i, p.x, p.y, p.z);
    }
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    const index = 7 * 33 + 16, p = new THREE.Vector3().fromBufferAttribute(positions, index);
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(p.clone().add(new THREE.Vector3(0, 0, side * 2)), new THREE.Vector3(0, 0, -side));
      const uv = ray.intersectObject(mesh)[0].uv!;
      expect(uv.x).toBeCloseTo(.5, 4); expect(uv.y).toBeCloseTo(.5, 4);
      const canvas = mistCanvasPoint(uv, { left: -2048, top: 0, width: 1024, height: 576 });
      expect(canvas.x).toBeCloseTo(-2048 + MIST_INK_WINDOW.x + MIST_INK_WINDOW.width / 2);
      expect(canvas.y).toBeCloseTo(MIST_INK_WINDOW.y + MIST_INK_WINDOW.height / 2);
    }
    geometry.dispose(); material.dispose();
  });

  it('matches crop orientation and CSS sizing without changing the mark aspect', () => {
    const rect = { left: 10, top: 20, width: 512, height: 288 }, top = mistCanvasPoint({ x: 0, y: 1 }, rect), bottom = mistCanvasPoint({ x: 1, y: 0 }, rect);
    expect(top).toEqual({ x: 104.5, y: 99 });
    expect(bottom.x - top.x).toBe(240); expect(bottom.y - top.y).toBe(135);
    expect(MIST_INK_WINDOW.width / MIST_INK_WINDOW.height).toBe(1024 / 576);
  });
});
