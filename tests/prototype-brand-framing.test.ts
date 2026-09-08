import * as THREE from 'three';
import { expect, it } from 'vitest';
import { brandClosePose, brandFraming } from '../client/prototypes/factory25dBrandFraming';
import { blendCamera, cameraPose } from '../client/prototypes/factory25dCameraMotion';

for (const [width, height] of [[1440, 900], [1033, 1044], [699, 900], [390, 844]]) {
  it(`keeps the entire shelf clear of its download card at ${width} × ${height}`, () => {
    const focus = new THREE.Vector3(-4.84, .6, 6.61), size = new THREE.Vector3(1.48, 1.18, .5);
    const target = brandClosePose(focus, new THREE.Quaternion(), size, width, height);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .01, 100);
    blendCamera(camera, target, target, 1, width / height, focus);
    const center = focus.clone().project(camera), frame = brandFraming(width, height);
    expect((center.x + 1) / 2).toBeCloseTo(frame.x);
    expect((1 - center.y) / 2).toBeCloseTo(frame.y);
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const p = focus.clone().add(new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2)).project(camera);
      const px = (p.x + 1) / 2, py = (1 - p.y) / 2;
      expect(px).toBeGreaterThan(.02); expect(py).toBeGreaterThan(.015);
      expect(px).toBeLessThan(width < 700 ? .98 : .55);
      expect(py).toBeLessThan(width < 700 ? .47 : .9);
    }
  });
}

it('hones in on the shelf along one screen-space path and can reverse midflight', () => {
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .01, 100);
  camera.position.set(0, 12, 18); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const focus = new THREE.Vector3(-4.84, .6, 6.61), from = cameraPose(camera);
  const to = brandClosePose(focus, new THREE.Quaternion(), new THREE.Vector3(1.48, 1.18, .5), 1440, 900);
  blendCamera(camera, from, to, 0, 1440 / 900, focus);
  const endX = brandFraming(1440, 900).x * 2 - 1;
  let previous = Math.abs(focus.clone().project(camera).x - endX);
  for (let t = 0; t <= 1; t += .1) {
    blendCamera(camera, from, to, t, 1440 / 900, focus);
    const x = focus.clone().project(camera).x;
    const distance = Math.abs(x - endX);
    expect(distance).toBeLessThanOrEqual(previous + 1e-8); previous = distance;
  }
  blendCamera(camera, from, to, .4, 1440 / 900, focus);
  const interruption = cameraPose(camera);
  blendCamera(camera, interruption, from, 0, 1440 / 900, focus);
  expect(camera.position.distanceTo(interruption.position)).toBeLessThan(1e-8);
  blendCamera(camera, interruption, from, 1, 1440 / 900, focus);
  expect(camera.position.distanceTo(from.position)).toBeLessThan(1e-8);
});
