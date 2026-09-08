import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCeilingLights } from '../client/prototypes/factory25dCeilingLights';
import { createLoungeDetails } from '../client/prototypes/factory25dLounge';
import { readLightPreferences } from '../client/prototypes/factory25dLightSwitches';
import type { BoardData } from '../client/prototypes/factory25dBoardData';

vi.mock('../client/prototypes/factory25dLoungeChat', () => ({ createLoungeChat: () => ({ update() {} }) }));
vi.mock('../client/prototypes/factory25dSoccer', () => ({ createSoccerInteraction: () => ({ update() {}, dispose() {} }) }));
afterEach(() => vi.unstubAllGlobals());

it('keeps manual ceiling choices through day/night changes without changing the sky', () => {
  const parent = new THREE.Group(), ceiling = createCeilingLights(parent, false), control = ceiling.lightSwitches[0];
  const lamps: THREE.RectAreaLight[] = [];
  parent.traverse(node => { if (node instanceof THREE.RectAreaLight) lamps.push(node); });
  expect(lamps.every(light => light.intensity === 0)).toBe(true);
  control.setOn(true); ceiling.update(10, false);
  expect(lamps.every(light => light.intensity === 50)).toBe(true);
  control.setOn(false);
  for (let i = 0; i < 60; i++) ceiling.update(.1, true);
  expect(control.isOn()).toBe(false); expect(lamps.every(light => light.intensity === 0)).toBe(true);
  control.setOn(true); expect(lamps.every(light => light.intensity === 50)).toBe(true);
});

it('extinguishes the flame and illumination through animated updates, and switches lamps independently', () => {
  const ctx = { fillRect() {}, putImageData() {}, createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  const room = new THREE.Group();
  const lounge = createLoungeDetails(room, {} as HTMLCanvasElement, new THREE.OrthographicCamera(), {} as THREE.WebGLRenderer, () => []);
  const [candle, desk, floor] = lounge.lightSwitches;
  const visibleEnergy = () => {
    let sum = 0; room.traverse(node => { if (node instanceof THREE.Light && node.visible) sum += node.intensity; }); return sum;
  };
  const original = visibleEnergy(); candle.setOn(false);
  for (let t = 0; t < 10; t += .1) lounge.update(t, false, {} as BoardData, new THREE.Camera(), true);
  expect(visibleEnergy()).toBeCloseTo(original - .8);
  const flame = candle.target.parent!.children.find(node => node instanceof THREE.Mesh && node.geometry instanceof THREE.OctahedronGeometry)!;
  expect(flame.visible).toBe(false);
  const beforeDesk = visibleEnergy(); desk.setOn(false);
  expect(visibleEnergy()).toBeCloseTo(beforeDesk - 4.5); expect(floor.isOn()).toBe(true);
  expect((desk.target as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissiveIntensity).toBe(0);
  desk.setOn(true); candle.setOn(true);
  expect(flame.visible).toBe(true); expect(visibleEnergy()).toBeCloseTo(original);
});

it('restores only valid boolean switch preferences and tolerates unavailable storage', () => {
  expect(readLightPreferences({ getItem: () => '{"lounge-candle":false,"front-desk-lamp":true,"unknown":"false"}' }))
    .toEqual({ 'lounge-candle': false, 'front-desk-lamp': true });
  expect(readLightPreferences({ getItem: () => 'broken' })).toEqual({});
  expect(readLightPreferences({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
});
