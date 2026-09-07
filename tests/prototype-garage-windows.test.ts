import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGarageWindows } from '../client/prototypes/factory25dGarageWindows';

describe('garage panorama windows', () => {
  it('keeps a transparent patch of mountain in front of visible sky and a separate backing at oblique angles', () => {
    const room = new THREE.Group(); room.position.y = -12;
    const windows = createGarageWindows(room, new THREE.MeshBasicMaterial({ transparent: true }));
    room.updateMatrixWorld(true);
    for (const pane of windows.group.children) {
      const terrain = pane.getObjectByName('window-terrain')!, target = terrain.getWorldPosition(new THREE.Vector3());
      const origin = target.clone().add(new THREE.Vector3(0, 6, 10));
      const ray = new THREE.Raycaster(origin, target.clone().sub(origin).normalize());
      const hits = ray.intersectObject(pane, true);
      const hit = (name: string) => hits.find(value => value.object.name === name)!;
      expect(hit('window-terrain')).toBeDefined(); expect(hit('window-sky')).toBeDefined(); expect(hit('window-backing')).toBeDefined();
      expect(hit('window-sky').distance - hit('window-terrain').distance).toBeGreaterThan(.015);
      expect(hit('window-backing').distance - hit('window-sky').distance).toBeGreaterThan(.03);
      expect(hits[0].object.name).toBe('window-terrain');
    }
    windows.dispose();
  });

  it.each([3.598, 4.2, 1])('preserves source aspect and uninterrupted horizontal coordinates with a %s-high source', sourceHeight => {
    const room = new THREE.Group(), windows = createGarageWindows(room, new THREE.MeshBasicMaterial(), undefined, sourceHeight);
    room.updateMatrixWorld(true);
    const samples: Array<{ x: number; y: number; u: number; v: number }> = [];
    for (const pane of windows.group.children) {
      const mesh = pane.getObjectByName('window-terrain') as THREE.Mesh<THREE.PlaneGeometry>;
      const positions = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        const world = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
        samples.push({ x: world.x, y: world.y, u: uv.getX(i), v: uv.getY(i) });
      }
    }
    const top = samples.filter(sample => sample.y > 1.86).sort((a, b) => a.x - b.x);
    const bottom = samples.find(sample => sample.y < 1.86)!;
    const yScale = (top[0].y - bottom.y) / ((top[0].v - bottom.v) * sourceHeight);
    for (let i = 1; i < top.length; i++) {
      const xScale = (top[i].x - top[i - 1].x) / ((top[i].u - top[i - 1].u) * 15.84);
      expect(xScale).toBeCloseTo(yScale, 5); // Includes the wall gaps between panes.
    }
    expect(Math.max(...samples.map(p => p.v))).toBeGreaterThan(.8);
    expect(samples.every(p => p.u >= 0 && p.u <= 1 && p.v >= 0 && p.v <= 1)).toBe(true);
    if (sourceHeight > 3) expect(top[0].v - bottom.v).toBeLessThan(.5);
    windows.dispose();
  });

  it('keeps live terrain, sky and cloud textures and disposes only its owned geometry/materials, once', () => {
    const room = new THREE.Group(), terrainTexture = new THREE.Texture(), skyTexture = new THREE.Texture(), cloudTexture = new THREE.Texture();
    const terrain = new THREE.MeshBasicMaterial({ map: terrainTexture }), sky = new THREE.MeshBasicMaterial({ map: skyTexture });
    const clouds = new THREE.MeshBasicMaterial({ map: cloudTexture, transparent: true, depthWrite: false });
    const windows = createGarageWindows(room, terrain, sky, 3.598, clouds);
    const protectedDisposals = [terrainTexture, skyTexture, cloudTexture, terrain, sky, clouds].map(resource => vi.spyOn(resource, 'dispose'));
    const owned = new Set<THREE.BufferGeometry | THREE.Material>();
    windows.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      owned.add(object.geometry); owned.add(object.material);
      if (object.name === 'window-terrain') { expect(object.material).not.toBe(terrain); expect(object.material.map).toBe(terrainTexture); }
      if (object.name === 'window-sky') { expect(object.material).not.toBe(sky); expect(object.material.map).toBe(skyTexture); }
      if (object.name === 'window-clouds') {
        expect(object.material).not.toBe(clouds); expect(object.material.map).toBe(cloudTexture);
        expect(object.material.transparent).toBe(true); expect(object.material.depthWrite).toBe(false);
      }
    });
    room.updateMatrixWorld(true);
    for (const pane of windows.group.children) {
      const target = pane.getObjectByName('window-terrain')!.getWorldPosition(new THREE.Vector3());
      const origin = target.clone().add(new THREE.Vector3(0, 6, 10));
      const hits = new THREE.Raycaster(origin, target.clone().sub(origin).normalize()).intersectObject(pane, true);
      const distance = (name: string) => hits.find(hit => hit.object.name === name)!.distance;
      expect(distance('window-clouds') - distance('window-terrain')).toBeGreaterThan(.005);
      expect(distance('window-sky') - distance('window-clouds')).toBeGreaterThan(.005);
    }
    const disposals = [...owned].map(resource => vi.spyOn(resource, 'dispose'));
    windows.dispose(); windows.dispose();
    expect(room.children).toHaveLength(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    for (const dispose of protectedDisposals) expect(dispose).not.toHaveBeenCalled();
  });
});
