import { describe, expect, it } from 'vitest';
import {
  BackRainSim,
  GLASS_SPLAT_S,
  GlassRainSim,
  MAX_GLASS_DROPS,
  MAX_GLASS_SIZE,
  OUTSIDE_RAIN_DEPTH_OFFSET,
  OUTSIDE_RAIN_SPEED_MULTIPLIER,
  glassDropRadius,
  paintBackRain,
  paintGlassRain,
} from '../client/sky/rain';
import type { GlassDrop } from '../client/sky/rain';
import { PixelBuffer } from '../client/sky/skylinePainter';
import { skyStateFromSnapshot } from '../client/sky/skyPhase';
import { solarSnapshot } from '../client/sky/solar';
import { CLEAR_WEATHER, parseWeatherOverride } from '../client/sky/weather';
import type { WeatherVisualState } from '../client/sky/weather';

const WIDTH = 240;
const HEIGHT = 60;
const RAIN = parseWeatherOverride('?skyWeather=rain')!;
const SNOW = parseWeatherOverride('?skyWeather=snow')!;
const NOON = Date.UTC(2026, 8, 3, 19, 0);
const palette = skyStateFromSnapshot(solarSnapshot(NOON)).palette;
const STILL_DRY: WeatherVisualState = { ...CLEAR_WEATHER, wind01: 0.15 };

function bead(overrides: Partial<GlassDrop> = {}): GlassDrop {
  return { x: 20, y: 10, size: 2, vy: 0, age: 0.2, dwell: 2, wobble: 0, ...overrides };
}

function run(sim: { step(dt: number, w: WeatherVisualState): void }, seconds: number, weather: WeatherVisualState, fps = 60) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) sim.step(1 / fps, weather);
}

function litPixels(pixels: PixelBuffer): number {
  let count = 0;
  for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] > 0) count++;
  return count;
}

describe('glass rain', () => {
  it('stays dry and paints nothing in clear weather', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 3, CLEAR_WEATHER);
    expect(sim.drops).toHaveLength(0);
    expect(sim.isDry).toBe(true);
    const pixels = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(pixels, sim, palette);
    expect(litPixels(pixels)).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const a = new GlassRainSim(WIDTH, HEIGHT, 7);
    const b = new GlassRainSim(WIDTH, HEIGHT, 7);
    run(a, 2, RAIN);
    run(b, 2, RAIN);
    expect(a.drops).toEqual(b.drops);
    expect(a.wet).toEqual(b.wet);
  });

  it('coalesces touching beads without losing water and releases a larger runner', () => {
    const sim = new GlassRainSim(60, 60);
    sim.drops.push(bead(), bead({ x: 21, size: 3 }));
    const area = sim.drops.reduce((sum, drop) => sum + drop.size ** 2, 0);
    sim.step(1 / 30, STILL_DRY);
    expect(sim.drops).toHaveLength(1);
    const merged = sim.drops[0];
    expect(merged.size ** 2).toBeCloseTo(area);
    expect(merged.size).toBeGreaterThan(3);
    expect(merged.age).toBeGreaterThanOrEqual(merged.dwell);
    expect(merged.vy).toBeGreaterThan(0);
    expect(merged.y).toBeGreaterThan(10);
    expect(sim.wet.some(value => value > 0)).toBe(true);
    const pixels = new PixelBuffer(60, 60);
    paintGlassRain(pixels, sim, palette);
    expect(litPixels(pixels)).toBeGreaterThan(0);
  });

  it('merges visibly touching edges without pulling separated beads together', () => {
    const touching = new GlassRainSim(60, 60), separated = new GlassRainSim(60, 60);
    const contact = glassDropRadius(1) * 2;
    // Contact tracks the visible bead radius even when the art scale changes.
    touching.drops.push(bead({ size: 1 }), bead({ x: 20 + contact - 0.1, size: 1 }));
    separated.drops.push(bead({ size: 1 }), bead({ x: 20 + contact + 0.1, size: 1 }));
    touching.step(1 / 30, STILL_DRY); separated.step(1 / 30, STILL_DRY);
    expect(touching.drops).toHaveLength(1);
    expect(touching.drops[0].size ** 2).toBeCloseTo(2);
    expect(separated.drops).toHaveLength(2);
    expect(separated.drops[1].x).toBeCloseTo(20 + contact + 0.1);
  });

  it('keeps oversized contacts separate instead of clipping away their water', () => {
    const sim = new GlassRainSim(60, 60);
    sim.drops.push(bead({ size: MAX_GLASS_SIZE }), bead({ x: 21, size: MAX_GLASS_SIZE }));
    sim.step(1 / 30, STILL_DRY);
    expect(sim.drops).toHaveLength(2);
    expect(sim.drops.reduce((sum, drop) => sum + drop.size ** 2, 0)).toBe(2 * MAX_GLASS_SIZE ** 2);
  });

  it('pulls running drops into a neighboring wet channel', () => {
    const dry = new GlassRainSim(60, 90), channeled = new GlassRainSim(60, 90);
    const runner = bead({ x: 20, y: 10, age: 1, dwell: 0, vy: 25 });
    dry.drops.push({ ...runner }); channeled.drops.push({ ...runner });
    for (let y = 10; y < 90; y++) channeled.wet[y * 60 + 23] = 1;
    run(dry, 0.5, STILL_DRY, 30);
    run(channeled, 0.5, STILL_DRY, 30);
    expect(channeled.drops).toHaveLength(1);
    const wetX = channeled.drops[0].x, dryX = dry.drops[0].x;
    expect(wetX).toBeGreaterThan(dryX + 0.5);
    expect(Math.abs(wetX - 23)).toBeLessThan(Math.abs(dryX - 23));
    expect(channeled.wet.some((value, index) => value > 0.1 && index % 60 === 22)).toBe(true);
  });

  it('chooses the stronger continuous route instead of a dry midpoint between streams', () => {
    const sim = new GlassRainSim(60, 120);
    const runner = bead({ x: 21, y: 10, size: 1, age: 1, dwell: 0, vy: 25 });
    sim.drops.push(runner);
    for (let y = 10; y < 120; y++) {
      sim.wet[y * 60 + 17] = 0.5;
      sim.wet[y * 60 + 25] = 1;
    }
    for (let frame = 0; frame < 24; frame++) {
      const previousX = runner.x;
      sim.step(1 / 30, STILL_DRY);
      expect(Math.abs(runner.x - previousX)).toBeLessThan(0.8);
    }
    expect(Math.abs(runner.x - 25)).toBeLessThan(0.5);
  });

  it('reuses a wet route across successive runners despite sideways wind', () => {
    const sim = new GlassRainSim(60, 150), dry = new GlassRainSim(60, 150);
    const windy = { ...STILL_DRY, wind01: 1 };
    const runner = bead({ x: 20, y: 10, age: 1, dwell: 0, vy: 25 });
    sim.drops.push(runner); dry.drops.push({ ...runner });
    for (let y = 10; y < 150; y++) sim.wet[y * 60 + 18] = 1;
    run(sim, 1.2, windy, 30); run(dry, 1.2, windy, 30);
    expect(Math.abs(runner.x - 18)).toBeLessThan(0.6);
    expect(dry.drops[0].x).toBeGreaterThan(22);
    const follower = bead({ x: 24, y: 10, age: 1, dwell: 0, vy: 25 });
    sim.drops.push(follower);
    run(sim, 1, windy, 30);
    expect(Math.abs(follower.x - 18)).toBeLessThan(0.6);
  });

  it('lets some small beads wait visibly before releasing and still drains after rain', () => {
    const source = new GlassRainSim(640, 145);
    run(source, 1, RAIN, 30);
    const waiting = source.drops.find(drop => drop.size === 1 && drop.dwell > 3);
    expect(waiting).toBeDefined();
    const sim = new GlassRainSim(640, 145);
    const drop = { ...waiting! };
    sim.drops.push(drop);
    const start = { x: drop.x, y: drop.y };
    run(sim, 2, STILL_DRY, 30);
    expect(drop.age).toBeGreaterThan(2);
    expect(drop.vy).toBe(0);
    expect({ x: drop.x, y: drop.y }).toEqual(start);
    run(sim, 15, STILL_DRY, 30);
    expect(sim.isDry).toBe(true);
  });

  it('builds a denser population and more water in heavy rain than light rain', () => {
    const light = new GlassRainSim(640, 145), heavy = new GlassRainSim(640, 145);
    run(light, 2, parseWeatherOverride('?skyWeather=rain-light')!, 30);
    run(heavy, 2, parseWeatherOverride('?skyWeather=rain-heavy')!, 30);
    expect(heavy.drops.length).toBeGreaterThan(light.drops.length * 1.5);
    const area = (sim: GlassRainSim) => sim.drops.reduce((sum, drop) => sum + drop.size ** 2, 0);
    expect(area(heavy)).toBeGreaterThan(area(light) * 1.5);
  });

  it('keeps arrivals and physical travel stable on a finer glass raster, then dries out', () => {
    const coarse = new GlassRainSim(320, 1000), fine = new GlassRainSim(640, 2000, undefined, 2);
    run(coarse, 0.5, RAIN, 30); run(fine, 0.5, RAIN, 30);
    expect(fine.drops.length).toBe(coarse.drops.length);
    coarse.drops.length = fine.drops.length = 0;
    const a = bead({ x: 40, y: 20, age: 1, dwell: 0, vy: 25 });
    const b = { ...a, x: a.x * 2, y: a.y * 2, vy: a.vy * 2 };
    coarse.drops.push(a); fine.drops.push(b);
    const windy = { ...STILL_DRY, wind01: 0.8 };
    run(coarse, 0.5, windy, 30); run(fine, 0.5, windy, 30);
    expect(b.x / 2).toBeCloseTo(a.x);
    expect(b.y / 2).toBeCloseTo(a.y);
    expect(b.vy / 2).toBeCloseTo(a.vy);
    const window = new GlassRainSim(1280, 290, undefined, 2);
    run(window, 3, RAIN, 30); run(window, 15, STILL_DRY, 30);
    expect(window.isDry).toBe(true);
    expect(window.wet.every(Number.isFinite)).toBe(true);
  });

  it('sustains wet channels during rain and lets residual wetness dry after it stops', () => {
    const dry = new GlassRainSim(1, 1), damp = new GlassRainSim(1, 1), raining = new GlassRainSim(1, 1);
    dry.wet[0] = damp.wet[0] = raining.wet[0] = 1;
    const postRain = parseWeatherOverride('?skyWeather=post-rain')!;
    run(dry, 1, STILL_DRY, 30);
    run(damp, 1, postRain, 30);
    run(raining, 1, RAIN, 30);
    expect(raining.wet[0]).toBeGreaterThan(damp.wet[0]);
    expect(damp.wet[0]).toBeGreaterThan(dry.wet[0]);
    run(raining, 15, postRain, 30);
    expect(raining.drops).toHaveLength(0);
    expect(raining.isDry).toBe(true);
  });

  it('keeps merged rain finite and bounded across long wet and dry cycles', () => {
    const sim = new GlassRainSim(48, 60, 12);
    const heavy = parseWeatherOverride('?skyWeather=rain-heavy')!;
    for (let i = 0; i < 300; i++) {
      sim.step(0.1, heavy);
      expect(sim.drops.length).toBeLessThanOrEqual(MAX_GLASS_DROPS);
      for (const drop of sim.drops) {
        expect(Object.values(drop).every(Number.isFinite)).toBe(true);
        expect(drop.size).toBeGreaterThanOrEqual(1);
        expect(drop.size).toBeLessThanOrEqual(MAX_GLASS_SIZE);
      }
    }
    expect(sim.wet.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    const before = sim.drops.map(drop => ({ ...drop }));
    sim.step(NaN, heavy); sim.step(Infinity, heavy); sim.step(-1, heavy);
    expect(sim.drops).toEqual(before);
    run(sim, 15, STILL_DRY, 30);
    expect(sim.isDry).toBe(true);
  });

  it('spawns drops that cling, then run down the glass leaving a trail', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 0.5, RAIN);
    expect(sim.drops.length).toBeGreaterThan(0);
    // The newest drop is still clinging just after impact.
    const first = sim.drops[sim.drops.length - 1];
    const start = { x: first.x, y: first.y };
    expect(first.age).toBeLessThan(first.dwell);
    expect(first.vy).toBe(0);

    run(sim, 5, RAIN);
    // The tracked drop has either run off the bottom or moved down from where it landed.
    const still = sim.drops.find(d => d === first);
    if (still) expect(still.y).toBeGreaterThan(start.y);
    let wetCount = 0;
    for (let i = 0; i < sim.wet.length; i++) if (sim.wet[i] > 0) wetCount++;
    expect(wetCount).toBeGreaterThan(20);
    expect(sim.isDry).toBe(false);
  });

  it('never exceeds the drop cap and dries out after the rain stops', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 6, RAIN);
    expect(sim.drops.length).toBeLessThanOrEqual(MAX_GLASS_DROPS);
    run(sim, 15, CLEAR_WEATHER);
    expect(sim.drops).toHaveLength(0);
    expect(sim.isDry).toBe(true);
  });

  it('clamps a huge frame step so a tab that was hidden does not explode the sim', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    sim.step(30, RAIN);
    expect(sim.drops.length).toBeLessThanOrEqual(MAX_GLASS_DROPS);
    for (const drop of sim.drops) {
      expect(drop.y).toBeLessThanOrEqual(HEIGHT + 2);
      expect(Number.isFinite(drop.x)).toBe(true);
    }
  });

  it('paints a splat on impact and a bead afterwards, both inside the glass', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 0.5, RAIN);
    const splat = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(splat, sim, palette);
    expect(litPixels(splat)).toBeGreaterThan(0);
    // The most recent arrival is still in its impact splat.
    expect(sim.drops[sim.drops.length - 1].age).toBeLessThan(GLASS_SPLAT_S);

    run(sim, 0.2, RAIN);
    const beads = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(beads, sim, palette);
    expect(litPixels(beads)).toBeGreaterThan(0);
  });
});

describe('back rain', () => {
  it('moves outdoor rain faster without enlarging its streaks or changing its density', () => {
    const sim = new BackRainSim(640, 1000), windy = { ...RAIN, wind01: .6 };
    sim.step(0, windy);
    const count = sim.streaks.length, streak = sim.streaks[0];
    streak.x = 100; streak.y = 100;
    const { speed, length } = streak;
    sim.step(.1, windy);
    const previousFall = speed * (.62 + windy.rain01 * .28) * .1;
    expect((streak.y - 100) / previousFall).toBeCloseTo(OUTSIDE_RAIN_SPEED_MULTIPLIER);
    expect(streak.x - 100).toBeCloseTo(windy.wind01 * 72 * .1 * OUTSIDE_RAIN_SPEED_MULTIPLIER);
    expect(streak.length).toBe(length); expect(sim.streaks).toHaveLength(count);
  });

  it('keeps outdoor fall at real-time speed on 5fps frames, bounds stalls, and ignores invalid time', () => {
    const slow = new BackRainSim(640, 2000), fast = new BackRainSim(640, 2000);
    slow.step(0, RAIN); fast.step(0, RAIN);
    for (const sim of [slow, fast]) { sim.streaks[0].x = 40; sim.streaks[0].y = 20; }
    slow.step(.2, RAIN);
    for (let i = 0; i < 12; i++) fast.step(1 / 60, RAIN);
    expect(slow.streaks[0].x).toBeCloseTo(fast.streaks[0].x);
    expect(slow.streaks[0].y).toBeCloseTo(fast.streaks[0].y);
    const before = slow.streaks.map(streak => ({ ...streak }));
    slow.step(NaN, RAIN); slow.step(Infinity, RAIN); slow.step(-1, RAIN);
    expect(slow.streaks).toEqual(before);
    slow.step(30, RAIN);
    expect(slow.streaks[0].y - before[0].y).toBeLessThan(100);
  });

  it('preserves particle identities and bounded positions when wrapping', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT); sim.step(0, RAIN);
    const objects = [...sim.streaks];
    for (const streak of sim.streaks) streak.y = HEIGHT + streak.length + 1;
    sim.step(1 / 30, RAIN);
    for (let i = 0; i < objects.length; i++) {
      expect(sim.streaks[i]).toBe(objects[i]); expect(sim.streaks[i].y).toBeLessThan(0);
    }
  });

  it('keeps outdoor density and travel stable while finer-raster streaks stay small', () => {
    const coarse = new BackRainSim(640, 1000), fine = new BackRainSim(1280, 2000, undefined, 2);
    coarse.step(0, RAIN); fine.step(0, RAIN);
    expect(fine.streaks.length).toBe(coarse.streaks.length);
    const a = coarse.streaks[0], b = fine.streaks[0];
    a.x = 40; a.y = 20; b.x = 80; b.y = 40;
    run(coarse, 0.5, RAIN, 30); run(fine, 0.5, RAIN, 30);
    expect(b.x / 2).toBeCloseTo(a.x);
    expect(b.y / 2).toBeCloseTo(a.y);
    expect(b.length).toBe(a.length);
    expect(b.speed / 2).toBe(a.speed);
  });
  it('composites readable streaks in front of the nearest mountain pass', () => {
    expect(OUTSIDE_RAIN_DEPTH_OFFSET).toBeGreaterThan(0.15);
    expect(OUTSIDE_RAIN_DEPTH_OFFSET).toBeLessThan(0.3);
  });
  it('has no streaks in clear weather and fills in with rain', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1 / 60, CLEAR_WEATHER);
    expect(sim.streaks).toHaveLength(0);
    sim.step(1 / 60, RAIN);
    expect(sim.streaks.length).toBeGreaterThan(WIDTH * 0.1);
    sim.step(1 / 60, CLEAR_WEATHER);
    expect(sim.streaks).toHaveLength(0);
  });

  it('turns distant snowfall into atmosphere instead of streaks behind the mountains', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1, SNOW);
    expect(sim.streaks).toHaveLength(0);
  });

  it('keeps every streak on the glass while falling and wrapping, with no global reset', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1 / 60, RAIN);
    const snapshot = () => sim.streaks.map(s => s.y);
    let previous = snapshot();
    for (let frame = 0; frame < 600; frame++) {
      sim.step(1 / 60, RAIN);
      const current = snapshot();
      // At most a handful of streaks recycle per frame; the rest keep falling.
      const recycled = current.filter((y, i) => y < previous[i]).length;
      expect(recycled).toBeLessThan(sim.streaks.length * 0.25);
      for (const streak of sim.streaks) {
        expect(streak.x).toBeGreaterThanOrEqual(0);
        expect(streak.x).toBeLessThan(WIDTH);
        expect(streak.y - streak.length).toBeLessThanOrEqual(HEIGHT);
      }
      previous = current;
    }
  });

  it('leans streaks with the wind and paints them into a transparent buffer', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    const windy: WeatherVisualState = { ...RAIN, wind01: 1 };
    const calm: WeatherVisualState = { ...RAIN, wind01: 0 };
    expect(sim.slant(windy)).toBeGreaterThan(sim.slant(calm));
    sim.step(1 / 60, windy);
    const pixels = new PixelBuffer(WIDTH, HEIGHT);
    paintBackRain(pixels, sim, palette, windy);
    expect(litPixels(pixels)).toBeGreaterThan(sim.streaks.length);
  });
});
