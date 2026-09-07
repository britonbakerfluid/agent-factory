import * as THREE from 'three';
import { clamp01 } from '../sky/skyPhase';
import type { WeatherVisualState } from '../sky/weather';

export interface ThunderStrike { seed: number; x: number; energy: number }
export interface ThunderFrame {
  pulse: number;
  bolt: number;
  strike?: ThunderStrike;
  thunder?: { energy: number; pan: number };
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** One broad illumination pulse, never an alternating flash train. */
export function lightningPulse(age: number, reduced = false): number {
  if (age < 0 || !Number.isFinite(age)) return 0;
  if (reduced) return age >= 1.8 ? 0 : Math.sin(age / 1.8 * Math.PI) ** 2 * .16;
  if (age >= .85) return 0;
  return age < .04 ? age / .04 : Math.exp(-(age - .04) / .17) * (1 - age / .85);
}

/** Visible elapsed time, not wall-clock catch-up: returning to a tab never bursts. */
export class ThunderstormTimeline {
  private readonly rng: () => number;
  private active = false;
  private untilStrike = 0;
  private age = Infinity;
  private current?: ThunderStrike;
  private thunderAt = Infinity;
  constructor(seed = 42197) { this.rng = random(seed); }

  update(dt: number, strength: number, reduced = false, visible = true): ThunderFrame {
    const empty: ThunderFrame = { pulse: 0, bolt: 0 };
    // Long gaps mean suspended rendering. Throw away any pending clap and start
    // a fresh quiet interval rather than playing an offscreen event on return.
    if (!visible || !Number.isFinite(dt) || dt > 1 || strength <= .08) {
      this.active = false; this.age = Infinity; this.current = undefined; this.thunderAt = Infinity;
      return empty;
    }
    if (!this.active) { this.active = true; this.untilStrike = 3 + this.rng() * 1.5; }
    const step = Math.max(0, dt);
    this.untilStrike -= step;
    this.age += step;
    const frame: ThunderFrame = { ...empty };
    if (this.untilStrike <= 0) {
      this.current = { seed: Math.floor(this.rng() * 1e7), x: .18 + this.rng() * .64, energy: .72 + this.rng() * .28 };
      this.age = 0;
      this.thunderAt = .85 + this.rng() * 1.1;
      this.untilStrike = 15 + this.rng() * 14 + (1 - clamp01(strength)) * 12;
      frame.strike = this.current;
    }
    if (!this.current) return frame;
    const energy = this.current.energy * clamp01(strength);
    frame.pulse = lightningPulse(this.age, reduced) * energy;
    frame.bolt = reduced ? 0 : clamp01(1 - this.age / .27) * energy;
    if (this.age >= this.thunderAt) {
      frame.thunder = { energy, pan: (this.current.x - .5) * 1.2 };
      this.thunderAt = Infinity;
    }
    return frame;
  }
}

type Point = readonly [number, number];
export type BoltSegment = readonly [Point, Point, number];

/** Jagged descending leader plus a few shorter, tapered branches. */
export function lightningBranches(strike: ThunderStrike): BoltSegment[] {
  const rng = random(strike.seed), segments: BoltSegment[] = [];
  const leader: Point[] = [[strike.x, .98]];
  let x = strike.x;
  for (let i = 1; i <= 16; i++) {
    x = THREE.MathUtils.clamp(x + (rng() - .5) * .085, .07, .93);
    leader.push([x, .98 - i * .055]);
    segments.push([leader[i - 1], leader[i], 1 - i * .019]);
  }
  for (const start of [4, 7, 10]) {
    let point = leader[start];
    const direction = rng() > .5 ? 1 : -1;
    for (let i = 0; i < 5; i++) {
      const next: Point = [THREE.MathUtils.clamp(point[0] + direction * (.017 + rng() * .035), .02, .98), point[1] - .025 - rng() * .034];
      segments.push([point, next, .48 - i * .065]); point = next;
    }
  }
  return segments;
}

export interface ThunderstormOptions {
  scene: THREE.Scene;
  patioScene?: THREE.Scene;
  garageScene?: THREE.Scene;
  width: number;
  height: number;
  centerY: number;
  onThunder?: (energy: number, pan: number) => void;
}

/** Physical window lighting with bolts behind the mountains, shared by both rooms. */
export function createThunderstorm(options: ThunderstormOptions) {
  const { scene, patioScene, garageScene, width, height, centerY, onThunder } = options;
  const timeline = new ThunderstormTimeline();
  const groups: THREE.Group[] = [];
  const lights: Array<{ light: THREE.Light; peak: number }> = [];
  const layers = [.0026, .010].map((lineWidth, index) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(32 * 6 * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('position', positions); geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({ color: index ? '#738cff' : '#dceaff', transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    return { lineWidth, geometry, positions, material, index };
  });
  function boltView(parent: THREE.Scene, offset: number) {
    const group = new THREE.Group(); group.name = 'storm-lightning';
    group.position.set(offset - width / 2, centerY - height / 2, -4.56);
    // Coplanar with the panorama: the closer opaque mountain pixels occlude it.
    group.scale.set(width, height, 1); group.visible = false; parent.add(group); groups.push(group);
    for (const layer of layers) {
      const mesh = new THREE.Mesh(layer.geometry, layer.material); mesh.frustumCulled = false; group.add(mesh);
    }
  }
  function windowLight(parent: THREE.Scene, x: number, floor: number, size: number, peak: number, lightHeight = height - .1) {
    const light = new THREE.RectAreaLight('#b9d3ff', 0, size, lightHeight);
    light.name = 'lightning-window-wash'; light.position.set(x, floor + centerY, -4.02);
    light.lookAt(x, floor + .6, 5); parent.add(light); lights.push({ light, peak });
  }
  boltView(scene, 0); windowLight(scene, 0, 0, width - .5, 22);
  if (patioScene) {
    boltView(patioScene, 16);
    const light = new THREE.DirectionalLight('#bad5ff', 0); light.name = 'lightning-outdoor-light';
    light.position.set(12, 8, -6); light.target.position.set(16, 0, 4);
    patioScene.add(light, light.target); lights.push({ light, peak: 1.4 });
  }
  if (garageScene) for (const x of [-6.25, 0, 6.25]) windowLight(garageScene, x, -12, 5.35, 16, 1.3);
  let disposed = false, lastPulse = 0;
  return {
    update(dt: number, weather: WeatherVisualState, reducedMotion = false, visible = true): number {
      if (disposed) return 0;
      const frame = timeline.update(dt, weather.thunder01 ?? (weather.mode === 'thunderstorm' ? 1 : 0), reducedMotion, visible);
      if (frame.strike && !reducedMotion) {
        const segments = lightningBranches(frame.strike);
        for (const layer of layers) {
          let vertex = 0;
          for (const [[ax, ay], [bx, by], weight] of segments) {
            const dx = (bx - ax) * width, dy = (by - ay) * height, length = Math.hypot(dx, dy) || 1;
            const half = layer.lineWidth * width * weight / 2;
            const ox = -dy / length * half / width, oy = dx / length * half / height;
            for (const [x, y] of [[ax + ox, ay + oy], [ax - ox, ay - oy], [bx + ox, by + oy], [bx + ox, by + oy], [ax - ox, ay - oy], [bx - ox, by - oy]]) {
              layer.positions.setXYZ(vertex++, x, y, 0);
            }
          }
          layer.positions.needsUpdate = true; layer.geometry.setDrawRange(0, vertex);
        }
      }
      for (const group of groups) group.visible = frame.bolt > .01;
      for (const layer of layers) layer.material.opacity = frame.bolt * (layer.index ? .16 : .9);
      if (frame.pulse !== lastPulse) {
        for (const { light, peak } of lights) light.intensity = frame.pulse * peak;
        lastPulse = frame.pulse;
      }
      if (frame.thunder) onThunder?.(frame.thunder.energy, frame.thunder.pan);
      return frame.pulse;
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const group of groups) group.removeFromParent();
      for (const { light } of lights) { light.removeFromParent(); if (light instanceof THREE.DirectionalLight) light.target.removeFromParent(); }
      for (const layer of layers) { layer.geometry.dispose(); layer.material.dispose(); }
    },
  };
}
