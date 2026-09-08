import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createWindowWeather } from '../client/prototypes/factory25dWeather';
import { BackRainSim, GlassRainSim } from '../client/sky/rain';
import { paletteForElevation } from '../client/sky/skyPhase';
import { CLEAR_WEATHER, parseWeatherOverride } from '../client/sky/weather';

vi.mock('../client/prototypes/factory25dCloudVolume', async () => {
  const { Texture } = await import('three');
  return { cloudStyleFromSearch: () => 'volume',
    createCloudVolume: () => ({ texture: new Texture(), update: vi.fn(), dispose: vi.fn() }) };
});
const palette = paletteForElevation(45, true), rain = parseWeatherOverride('?skyWeather=rain-heavy')!, snow = parseWeatherOverride('?skyWeather=snow-heavy')!;
beforeEach(() => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { hidden: false, createElement: vi.fn(() => { throw new Error('Precipitation should not allocate a canvas'); }) });
  vi.stubGlobal('location', { search: '' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const makeWeather = () => createWindowWeather(new THREE.Scene(), {} as THREE.WebGLRenderer, 18, 4.078125, 2);

describe('weather precipitation uploads', () => {
  it('uses direct RGBA textures and does no precipitation painting or wet-grid stepping on dry days', () => {
    const step = vi.spyOn(GlassRainSim.prototype, 'step'), weather = makeWeather();
    const outside = weather.windowMaterials.outsideMaterial.map as THREE.DataTexture;
    const surface = weather.windowMaterials.surfaceMaterial.map as THREE.DataTexture;
    const initial = [outside.version, surface.version];
    for (let i = 0; i < 60; i++) weather.update(1 / 30, CLEAR_WEATHER, palette);
    expect(outside).toBeInstanceOf(THREE.DataTexture); expect(surface).toBeInstanceOf(THREE.DataTexture);
    expect(outside.image.data).toBeInstanceOf(Uint8ClampedArray);
    expect(outside.image.width).toBe(1280); expect(outside.image.height).toBe(290);
    expect(outside.flipY).toBe(true); expect(outside.magFilter).toBe(THREE.NearestFilter);
    expect([outside.version, surface.version]).toEqual(initial);
    expect(step).not.toHaveBeenCalled(); expect(document.createElement).not.toHaveBeenCalled();
    weather.dispose();
  });

  it('uploads only falling rain in rain, clears it once on stopping, and lets the glass finish draining', () => {
    const step = vi.spyOn(GlassRainSim.prototype, 'step'), weather = makeWeather();
    const outside = weather.windowMaterials.outsideMaterial.map as THREE.DataTexture;
    const surface = weather.windowMaterials.surfaceMaterial.map as THREE.DataTexture;
    const beforeRain = outside.version, beforeSnow = surface.version;
    for (let i = 0; i < 30; i++) weather.update(1 / 30, rain, palette);
    expect(outside.version - beforeRain).toBe(30); expect(surface.version).toBe(beforeSnow);
    expect(outside.image.data.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
    const rainyVersion = outside.version, calls = step.mock.calls.length;
    for (let i = 0; i < 900; i++) weather.update(1 / 30, CLEAR_WEATHER, palette);
    expect(outside.version).toBe(rainyVersion + 1); expect(surface.version).toBe(beforeSnow);
    expect(outside.image.data.every(value => value === 0)).toBe(true);
    expect(step.mock.calls.length).toBeGreaterThan(calls);
    const dryCalls = step.mock.calls.length;
    for (let i = 0; i < 30; i++) weather.update(1 / 30, CLEAR_WEATHER, palette);
    expect(step.mock.calls.length).toBe(dryCalls);
    weather.dispose();
  });

  it('uploads snow independently and preserves elapsed outdoor time when rendered slowly', () => {
    const outsideStep = vi.spyOn(BackRainSim.prototype, 'step'), weather = makeWeather();
    const outside = weather.windowMaterials.outsideMaterial.map as THREE.DataTexture;
    const surface = weather.windowMaterials.surfaceMaterial.map as THREE.DataTexture;
    const initial = [outside.version, surface.version];
    weather.update(.2, snow, palette);
    expect(outsideStep).toHaveBeenLastCalledWith(.2, snow);
    expect(outside.version).toBe(initial[0]); expect(surface.version).toBe(initial[1] + 1);
    expect(surface.image.data.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
    weather.update(.2, CLEAR_WEATHER, palette);
    expect(surface.version).toBe(initial[1] + 2);
    expect(surface.image.data.every(value => value === 0)).toBe(true);
    weather.dispose();
  });
});
