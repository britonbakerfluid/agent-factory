import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGarageLighting } from '../client/prototypes/factory25dGarageLighting';
import { createGarageWindows } from '../client/prototypes/factory25dGarageWindows';

function fixture() {
  const room = new THREE.Group(); room.position.y = -12;
  const lighting = createGarageLighting(room);
  const sourceMaterial = new THREE.MeshBasicMaterial({ transparent: true });
  const windows = createGarageWindows(room, sourceMaterial);
  room.updateMatrixWorld(true);
  const world = (x: number, y: number, z: number) => room.localToWorld(new THREE.Vector3(x, y, z));
  function blockers(from: THREE.Vector3, to: THREE.Vector3) {
    const direction = to.clone().sub(from), length = direction.length();
    return new THREE.Raycaster(from, direction.normalize(), 0, length).intersectObject(room, true)
      .filter(hit => hit.object.castShadow);
  }
  return { room, lighting, world, blockers, dispose() { lighting.dispose(); windows.dispose(); sourceMaterial.dispose(); } };
}

describe('garage enclosed lighting', () => {
  it('blocks overhead sunlight with a roof that remains inside the sunlight shadow range', () => {
    const scene = fixture();
    const vertical = scene.blockers(scene.world(0, 10, 5.8), scene.world(0, 0, 5.8));
    expect(vertical[0]?.object.name).toBe('cutaway-ceiling');
    const sunlight = scene.lighting.lights.getObjectByName('garage-window-sun') as THREE.DirectionalLight;
    const origin = sunlight.getWorldPosition(new THREE.Vector3()), target = sunlight.target.getWorldPosition(new THREE.Vector3());
    const roof = scene.blockers(origin, target).find(hit => hit.object.name === 'cutaway-ceiling');
    expect(roof).toBeDefined();
    sunlight.shadow.updateMatrices(sunlight);
    const shadowPoint = roof!.point.clone().applyMatrix4(sunlight.shadow.camera.matrixWorldInverse);
    expect(-shadowPoint.z).toBeGreaterThan(sunlight.shadow.camera.near);
    expect(-shadowPoint.z).toBeLessThan(sunlight.shadow.camera.far);
    scene.dispose();
  });

  it('admits light through all three real window openings while blocking sill, header and piers', () => {
    const scene = fixture();
    for (const center of [-6.25, 0, 6.25]) for (const dx of [-2.2, 0, 2.2]) for (const y of [1.35, 1.86, 2.35]) {
      expect(scene.blockers(scene.world(center + dx, y, -6), scene.world(center + dx, y, -3))).toHaveLength(0);
    }
    for (const [x, y, expected] of [[0, .6, 'window-sill-wall'], [0, 3, 'window-header-wall'], [-3.125, 1.86, 'window-pier'], [3.125, 1.86, 'window-pier']] as const) {
      const hits = scene.blockers(scene.world(x, y, -6), scene.world(x, y, -3));
      expect(hits.some(hit => hit.object.name === expected)).toBe(true);
    }
    scene.dispose();
  });

  it('keeps the near shell in the shadow pass without painting or covering the room in the camera pass', () => {
    const scene = fixture();
    const cuts = scene.lighting.shell.children.filter(node => node.name.startsWith('cutaway-')) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
    expect(cuts.length).toBeGreaterThanOrEqual(4);
    for (const cut of cuts) {
      expect(cut.visible).toBe(true); expect(cut.castShadow).toBe(true);
      expect(cut.material.colorWrite).toBe(false); expect(cut.material.depthWrite).toBe(false);
      expect(cut.material.shadowSide).toBe(THREE.DoubleSide);
    }
    expect(scene.blockers(scene.world(0, 2, 20), scene.world(0, 2, 10))[0]?.object.name).toBe('cutaway-front-wall');
    expect(scene.blockers(scene.world(16, 2, 6), scene.world(8, 2, 6))[0]?.object.name).toBe('cutaway-side-wall');
    scene.dispose();
  });

  it('aims indoor ceiling lights at the floor from below the roof, leaving their paths unobstructed', () => {
    const scene = fixture(), ceilingLights = scene.lighting.lights.children.filter(node => node.name === 'garage-ceiling-wash') as THREE.RectAreaLight[];
    expect(ceilingLights.length).toBeGreaterThan(0);
    for (const light of ceilingLights) {
      const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(light.getWorldQuaternion(new THREE.Quaternion()));
      expect(normal.y).toBeLessThan(-.9);
      const origin = light.getWorldPosition(new THREE.Vector3());
      const floor = origin.clone().addScaledVector(normal, (scene.room.position.y - origin.y) / normal.y);
      expect(scene.blockers(origin, floor)).toHaveLength(0);
      expect(scene.blockers(origin, origin.clone().add(new THREE.Vector3(0, 2, 0)))[0]?.object.name).toBe('cutaway-ceiling');
    }
    const overhead = scene.lighting.lights.getObjectByName('garage-overhead-form') as THREE.DirectionalLight;
    expect(scene.blockers(overhead.getWorldPosition(new THREE.Vector3()), overhead.target.getWorldPosition(new THREE.Vector3()))).toHaveLength(0);
    overhead.shadow.updateMatrices(overhead);
    const shadowCamera = overhead.shadow.camera;
    // A tilted light can clear its center target while its near plane rises above
    // the roof over distant floor corners, drawing a large diagonal roof shadow.
    for (const x of [-10, 0, 10]) for (const z of [-2, 6, 14]) {
      const floor = scene.world(x, 0, z);
      const nearPlane = floor.clone().applyMatrix4(shadowCamera.matrixWorldInverse);
      nearPlane.z = -shadowCamera.near;
      nearPlane.applyMatrix4(shadowCamera.matrixWorld);
      expect(scene.blockers(nearPlane, floor).filter(hit => hit.object.name === 'cutaway-ceiling'), `overhead roof shadow at floor (${x}, ${z})`).toHaveLength(0);
    }
    scene.dispose();
  });

  it('tracks source daylight color, direction and intensity while increasing indoor fill as night falls', () => {
    const scene = fixture();
    const source = {
      ambient: new THREE.HemisphereLight('#d4e9fc', '#645646', 4),
      window: new THREE.RectAreaLight('#bfe8ff', 8),
      sun: new THREE.DirectionalLight('#ffcf8b', 2),
    };
    source.sun.position.set(-12, 22, -16); source.sun.target.position.set(2, 0, 3); source.sun.castShadow = true;
    const sun = scene.lighting.lights.getObjectByName('garage-window-sun') as THREE.DirectionalLight;
    const ambient = scene.lighting.lights.children.find(node => node instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    const windowWash = scene.lighting.lights.children.filter(node => node.name === 'garage-window-wash') as THREE.RectAreaLight[];
    const ceilingWash = scene.lighting.lights.children.filter(node => node.name === 'garage-ceiling-wash') as THREE.RectAreaLight[];
    const overhead = scene.lighting.lights.getObjectByName('garage-overhead-form') as THREE.DirectionalLight;
    scene.lighting.sync(source);
    const day = { sun: sun.intensity, ambient: ambient.intensity, window: windowWash.map(light => light.intensity), ceiling: ceilingWash.map(light => light.intensity), overhead: overhead.intensity };
    expect(sun.color.equals(source.sun.color)).toBe(true); expect(sun.castShadow).toBe(true);
    const sourceDirection = source.sun.position.clone().sub(source.sun.target.position).normalize();
    expect(sun.position.clone().sub(sun.target.position).normalize().distanceTo(sourceDirection)).toBeLessThan(1e-10);

    source.ambient.intensity = .1; source.ambient.color.set('#284b81'); source.ambient.groundColor.set('#292332');
    source.window.intensity = .3; source.window.color.set('#536994');
    source.sun.intensity = .12; source.sun.color.set('#859abe'); source.sun.position.set(13, 8, -12); source.sun.castShadow = false;
    scene.lighting.sync(source);
    expect(ambient.color.equals(source.ambient.color)).toBe(true); expect(ambient.groundColor.equals(source.ambient.groundColor)).toBe(true);
    expect(ambient.intensity).toBeLessThan(day.ambient); expect(sun.intensity).toBeLessThan(day.sun);
    expect(sun.color.equals(source.sun.color)).toBe(true); expect(sun.castShadow).toBe(false);
    expect(sun.position.clone().sub(sun.target.position).normalize().distanceTo(source.sun.position.clone().sub(source.sun.target.position).normalize())).toBeLessThan(1e-10);
    windowWash.forEach((light, i) => { expect(light.color.equals(source.window.color)).toBe(true); expect(light.intensity).toBeLessThan(day.window[i]); });
    ceilingWash.forEach((light, i) => expect(light.intensity).toBeGreaterThan(day.ceiling[i]));
    expect(overhead.intensity).toBeGreaterThan(day.overhead);
    // Sync copies color values without giving the garage ownership of source lights.
    expect(sun.color).not.toBe(source.sun.color); expect(ambient.color).not.toBe(source.ambient.color);
    scene.dispose();
  });
});
