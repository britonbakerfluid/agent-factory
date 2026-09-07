import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGarageLighting } from '../client/prototypes/factory25dGarageLighting';
import { furnishGarage } from '../client/prototypes/factory25dGarageFurnishings';
import { createPatioTerraces } from '../client/prototypes/factory25dPatioTerraces';
import { createSideRoom } from '../client/prototypes/factory25dSideRoom';

// Plant generation, water and contact textures are independent of fixture circuits.
vi.mock('../client/prototypes/factory25dContactShadows', () => ({ contactShadow: () => new THREE.Mesh() }));
vi.mock('../client/prototypes/factory25dPlants', () => ({ createIndoorPlants: () => ({ shelf() {}, plant() {}, update() {} }) }));
vi.mock('../client/prototypes/factory25dPatioGarden', () => ({ createPatioGarden: () => ({ tree() {}, border() {}, finish() {}, update() {}, dispose() {} }) }));
vi.mock('../client/prototypes/factory25dPatioWater', () => ({ createPatioWater: () => ({ update() {}, dispose() {} }) }));
vi.mock('../client/prototypes/factory25dPatioStations', () => ({ createPatioStations: () => [] }));

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {} }) }) });
});
afterEach(() => vi.unstubAllGlobals());

function pointLights(parent: THREE.Object3D) {
  const lights: THREE.PointLight[] = [];
  parent.traverse(node => { if (node instanceof THREE.PointLight) lights.push(node); });
  return lights;
}

describe('physical room light switches', () => {
  it('keeps the garage overhead circuit off through daylight changes without switching off the sun or windows', () => {
    const lighting = createGarageLighting(new THREE.Group());
    const source = { ambient: new THREE.HemisphereLight('#ffffff', '#333333', .1),
      window: new THREE.RectAreaLight('#aabbcc', 4), sun: new THREE.DirectionalLight('#ffffff', 1.2) };
    source.sun.position.set(-8, 20, -30);
    lighting.setInteriorOn(false); lighting.sync(source);
    expect(lighting.isInteriorOn()).toBe(false);
    for (const light of lighting.lights.children) {
      if (light.name === 'garage-ceiling-wash' || light.name === 'garage-overhead-form' || light instanceof THREE.PointLight) {
        expect((light as THREE.Light).intensity).toBe(0);
      }
      if (light.name === 'garage-window-wash' || light.name === 'garage-window-sun') expect((light as THREE.Light).intensity).toBeGreaterThan(0);
    }
    lighting.setInteriorOn(true);
    expect((lighting.lights.getObjectByName('garage-ceiling-wash') as THREE.Light).intensity).toBeGreaterThan(20);
    lighting.dispose();
  });

  it('switches the reading lamp independently from the workbench and disposes its private shade material', () => {
    const room = new THREE.Group(), fixtures = furnishGarage(room);
    const reading = fixtures.lightSwitches.find(fixture => fixture.id === 'garage-reading-lamp')!;
    const bench = fixtures.lightSwitches.find(fixture => fixture.id === 'garage-workbench-light')!;
    const shade = reading.target as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const dispose = vi.spyOn(shade.material, 'dispose');
    reading.setOn(false); fixtures.update(20, false);
    expect(pointLights(reading.target.parent!)[0].intensity).toBe(0);
    expect(shade.material.emissiveIntensity).toBe(0);
    expect(bench.isOn()).toBe(true); expect(pointLights(bench.target)[0].intensity).toBe(2.7);
    reading.setOn(true);
    expect(pointLights(reading.target.parent!)[0].intensity).toBe(3);
    expect(shade.material.emissiveIntensity).toBe(.8);
    fixtures.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });

  it('preserves patio lamp and fire choices through night, rain and snow updates', () => {
    const room = new THREE.Group(), terraces = createPatioTerraces(room, new THREE.MeshStandardMaterial());
    for (const fixture of terraces.lightSwitches) fixture.setOn(false);
    terraces.update(0, 0, true, 20);
    expect(pointLights(room).every(light => light.intensity === 0)).toBe(true);
    const fire = terraces.lightSwitches.find(fixture => fixture.id === 'patio-fire-bowl')!;
    const flames = fire.hitTargets!.slice(1);
    expect(flames.every(flame => !flame.visible)).toBe(true);
    fire.setOn(true); terraces.update(0, 1, true, 30);
    expect(fire.isOn()).toBe(true); expect(flames.every(flame => !flame.visible)).toBe(true);
    terraces.update(0, 0, true, 40, true);
    expect(flames.every(flame => flame.visible && flame.scale.y === 1)).toBe(true);
    expect(pointLights(room).filter(light => light.intensity > 0).map(light => light.intensity)).toEqual([1.2]);
    fire.setOn(false); terraces.update(0, 0, false, 45);
    expect(pointLights(room).every(light => light.intensity === 0)).toBe(true);
    terraces.dispose();
  });

  it('keeps two string-light runs independent and applies the latest night brightness when one is restored', () => {
    const scene = new THREE.Scene(), patio = createSideRoom(scene);
    const source = new THREE.DirectionalLight('#ffffff', 1); source.position.set(1, 10, 3);
    expect(new Set(patio.lightSwitches.map(fixture => fixture.id)).size).toBe(patio.lightSwitches.length);
    patio.lightSwitches.forEach(fixture => fixture.setOn(false));
    patio.update(source, 0, 0, true, 20);
    expect(pointLights(scene).every(light => light.intensity === 0)).toBe(true);
    const first = patio.lightSwitches.find(fixture => fixture.id === 'patio-string-lights-1')!;
    const second = patio.lightSwitches.find(fixture => fixture.id === 'patio-string-lights-2')!;
    first.setOn(true); patio.update(source, 0, 0, true, 30);
    expect(second.isOn()).toBe(false);
    expect(pointLights(scene).filter(light => light.intensity > 0).map(light => light.intensity)).toEqual([4.4, 4.4]);
    expect(scene.children.find(node => node instanceof THREE.DirectionalLight)).toHaveProperty('intensity', 1);
    const bulbMaterial = (first.target as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
    const dispose = vi.spyOn(bulbMaterial, 'dispose'); patio.dispose(); expect(dispose).toHaveBeenCalledOnce();
  });
});
