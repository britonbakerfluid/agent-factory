import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { projectNameTagAnchor } from '../client/prototypes/factory25dLabels';

function camera() {
  const view = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
  view.position.set(0, 9, 14.6); view.lookAt(0, .35, .45); view.updateMatrixWorld();
  return view;
}

describe('name attachment to painted feet', () => {
  it('keeps different walking frames attached at factory and terrace floor heights', () => {
    const view = camera(), sprite = new THREE.Object3D();
    for (const floor of [.018, .36, .72, -11.982]) for (const feetPixel of [26, 27, 28, 29, 32]) {
      const feet = new THREE.Vector3(0, (.5 - feetPixel / 32) * .86, 0);
      sprite.position.set(1, floor - feet.y + .004, 2);
      const projected = projectNameTagAnchor(sprite, floor, view, new THREE.Vector3(), feet);
      expect(projected.distanceTo(new THREE.Vector3(1, floor + .004, 2).project(view))).toBeLessThan(1e-9);
    }
  });

  it('follows a lifted and tilted sprite instead of leaving its name on the floor', () => {
    const view = camera(), sprite = new THREE.Object3D(), feet = new THREE.Vector3(0, -.3, 0);
    sprite.position.set(1, 1.3, 2); sprite.scale.set(1.2, .8, 1); sprite.rotation.z = Math.PI / 6;
    const actual = projectNameTagAnchor(sprite, 0, view, new THREE.Vector3(), feet);
    const expected = new THREE.Vector3(1 + .24 * Math.sin(Math.PI / 6), 1.3 - .24 * Math.cos(Math.PI / 6), 2).project(view);
    expect(actual.distanceTo(expected)).toBeLessThan(1e-9);
    expect(actual.y - new THREE.Vector3(1, 0, 2).project(view).y).toBeGreaterThan(.1);
  });

  it('uses the current pose and parent transform before the next render, including camera zoom', () => {
    const view = camera(), room = new THREE.Group(), sprite = new THREE.Object3D(), feet = new THREE.Vector3(0, -.3, 0);
    room.add(sprite); room.position.set(2, 0, -1); sprite.position.set(1, .3, 2);
    projectNameTagAnchor(sprite, 0, view, new THREE.Vector3(), feet);
    room.position.y = .4; sprite.position.x = 3; sprite.position.y += .6;
    view.zoom = 1.5; view.updateProjectionMatrix();
    const actual = projectNameTagAnchor(sprite, 0, view, new THREE.Vector3(), feet);
    expect(actual.distanceTo(new THREE.Vector3(5, 1, 1).project(view))).toBeLessThan(1e-9);
    // Stationary markers still use their floor when they have no painted sprite anchor.
    const marker = projectNameTagAnchor(sprite, .4, view, new THREE.Vector3());
    expect(marker.distanceTo(new THREE.Vector3(5, .4, 1).project(view))).toBeLessThan(1e-9);
  });
});
