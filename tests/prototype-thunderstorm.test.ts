import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CLEAR_WEATHER, lerpWeather, parseWeatherOverride, weatherFromOpenMeteo } from '../client/sky/weather';
import { ThunderstormTimeline, createThunderstorm, lightningBranches, lightningPulse } from '../client/prototypes/factory25dThunderstorm';

const storm = parseWeatherOverride('?skyWeather=thunderstorm')!;

describe('explicit thunderstorm weather', () => {
  it('keeps heavy rain distinct, and blends the lightning intensity separately', () => {
    expect(storm.mode).toBe('thunderstorm');
    expect(storm.thunder01).toBe(1);
    expect(storm.rain01).toBeGreaterThan(.7);
    expect(parseWeatherOverride('?skyWeather=rain-heavy')?.thunder01 ?? 0).toBe(0);
    expect(lerpWeather(CLEAR_WEATHER, storm, .25).thunder01).toBe(.25);
    expect(lerpWeather(storm, CLEAR_WEATHER, .75).thunder01).toBe(.25);
  });
  it('maps WMO thunderstorm and hail codes, even without rain measurements', () => {
    for (const code of [95, 96, 99]) {
      const state = weatherFromOpenMeteo({ current: { weather_code: code } });
      expect(state.mode).toBe('thunderstorm');
      expect(state.thunder01).toBeGreaterThan(.5);
      expect(state.cloud01).toBeGreaterThanOrEqual(.9);
      expect(state.cloudForm01).toBeGreaterThanOrEqual(.9);
    }
    expect(weatherFromOpenMeteo({ current: { weather_code: 65, rain: 5 } }).thunder01).toBe(0);
  });
});

describe('bounded storm cadence', () => {
  it('delays thunder until after each single strike, with spacious intervals', () => {
    const timeline = new ThunderstormTimeline(5), strikes: number[] = [], claps: number[] = [];
    for (let time = 0; time < 120; time += .05) {
      const frame = timeline.update(.05, 1);
      if (frame.strike) strikes.push(time);
      if (frame.thunder) claps.push(time);
      expect(frame.pulse).toBeGreaterThanOrEqual(0); expect(frame.pulse).toBeLessThanOrEqual(1);
    }
    expect(strikes.length).toBeGreaterThan(3); expect(strikes.length).toBeLessThan(9);
    expect(claps).toHaveLength(strikes.length);
    for (let i = 0; i < strikes.length; i++) {
      expect(claps[i] - strikes[i]).toBeGreaterThanOrEqual(.8);
      expect(claps[i] - strikes[i]).toBeLessThan(2.1);
      if (i) expect(strikes[i] - strikes[i - 1]).toBeGreaterThanOrEqual(15);
    }
  });
  it('drops queued thunder and illumination when hidden, inactive or suspended', () => {
    for (const interruption of ['hidden', 'inactive', 'suspended']) {
      const timeline = new ThunderstormTimeline();
      let struck = false;
      for (let i = 0; i < 100 && !struck; i++) struck = !!timeline.update(.05, 1).strike;
      expect(struck).toBe(true);
      expect(timeline.update(interruption === 'suspended' ? 100 : .05, interruption === 'inactive' ? 0 : 1, false, interruption !== 'hidden'))
        .toEqual({ pulse: 0, bolt: 0 });
      for (let i = 0; i < 55; i++) expect(timeline.update(.05, 1)).toEqual({ pulse: 0, bolt: 0 });
    }
  });
  it('uses one gentle wash with no visible bolt in reduced motion', () => {
    const timeline = new ThunderstormTimeline(); let max = 0, claps = 0;
    for (let i = 0; i < 200; i++) {
      const frame = timeline.update(.05, 1, true); max = Math.max(max, frame.pulse);
      expect(frame.bolt).toBe(0); if (frame.thunder) claps++;
    }
    expect(max).toBeGreaterThan(.08); expect(max).toBeLessThanOrEqual(.16); expect(claps).toBe(1);
    expect(lightningPulse(-1)).toBe(0); expect(lightningPulse(Infinity)).toBe(0);
    let peaks = 0;
    for (let t = .01; t < 2; t += .01)
      if (lightningPulse(t) > lightningPulse(t - .01) && lightningPulse(t) >= lightningPulse(t + .01)) peaks++;
    expect(peaks).toBe(1);
  });
});

it('creates deterministic descending branches contained inside the panorama', () => {
  const strike = { seed: 83, x: .35, energy: .9 }, first = lightningBranches(strike);
  expect(first).toEqual(lightningBranches(strike)); expect(first.length).toBe(31);
  expect(first).not.toEqual(lightningBranches({ ...strike, seed: 84 }));
  for (const [a, b, weight] of first) {
    expect(b[1]).toBeLessThan(a[1]); expect(weight).toBeGreaterThan(0);
    for (const [x, y] of [a, b]) { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(1); expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(1); }
  }
});

it('illuminates the real rooms, reuses bolt buffers and removes all owned resources', () => {
  const scene = new THREE.Scene(), patioScene = new THREE.Scene(), garageScene = new THREE.Scene(), thunder = vi.fn();
  const effect = createThunderstorm({ scene, patioScene, garageScene, width: 15.84, height: 3.598, centerY: 1.8, onThunder: thunder });
  const washes = [scene, patioScene, garageScene].flatMap(parent => parent.children.filter(child => child instanceof THREE.Light));
  expect(washes).toHaveLength(5); expect(washes.every(light => light.intensity === 0)).toBe(true);
  const bolt = scene.getObjectByName('storm-lightning')!;
  const meshes = bolt.children as THREE.Mesh[];
  const geometries = meshes.map(mesh => mesh.geometry), materials = meshes.map(mesh => mesh.material as THREE.Material);
  const geometryDisposal = geometries.map(geometry => vi.spyOn(geometry, 'dispose'));
  const materialDisposal = materials.map(material => vi.spyOn(material, 'dispose'));
  let max = 0;
  for (let i = 0; i < 180; i++) {
    const pulse = effect.update(.05, storm); max = Math.max(max, pulse);
    if (pulse > 0) expect(washes.every(light => light.intensity > 0)).toBe(true);
  }
  expect(max).toBeGreaterThan(.5); expect(thunder).toHaveBeenCalledOnce();
  expect(meshes.map(mesh => mesh.geometry)).toEqual(geometries);
  expect(geometries.every(geometry => geometry.drawRange.count === 31 * 6)).toBe(true);
  effect.update(.05, CLEAR_WEATHER);
  expect(washes.every(light => light.intensity === 0)).toBe(true); expect(bolt.visible).toBe(false);
  effect.dispose(); effect.dispose();
  for (const parent of [scene, patioScene, garageScene]) expect(parent.children).toHaveLength(0);
  for (const dispose of [...geometryDisposal, ...materialDisposal]) expect(dispose).toHaveBeenCalledOnce();
  expect(effect.update(.05, storm)).toBe(0);
});
