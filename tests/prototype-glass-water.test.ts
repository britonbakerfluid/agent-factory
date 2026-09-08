import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGlassWater, paintGlassHeight } from '../client/prototypes/factory25dGlassWater';
import { GlassRainSim } from '../client/sky/rain';
import { paletteForElevation } from '../client/sky/skyPhase';

const palette = paletteForElevation(45, true);
function bead(sim: GlassRainSim) {
  sim.drops.push({ x: 12, y: 8, size: 3, age: 1, dwell: .5, vy: 20, wobble: 0 });
}
function rendererStub() {
  const previousTarget = new THREE.WebGLRenderTarget(10, 10);
  let target: THREE.WebGLRenderTarget | null = previousTarget;
  const color = new THREE.Color('#123456'); let alpha = .4;
  const renderer = {
    autoClear: false,
    getRenderTarget: () => target, setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => { target = value; }),
    getClearAlpha: () => alpha, getClearColor: (out: THREE.Color) => out.copy(color),
    setClearColor: (value: THREE.ColorRepresentation, a: number) => { color.set(value); alpha = a; },
    clear: vi.fn(), render: vi.fn(),
  };
  return { renderer, previousTarget, asWebGL: renderer as unknown as THREE.WebGLRenderer };
}

describe('refracting glass water', () => {
  it('keeps dry glass flat, rounds beads and preserves weaker connecting trails', () => {
    const sim = new GlassRainSim(32, 16), height = new Float32Array(512), pixels = new Uint8Array(2048);
    paintGlassHeight(sim, height, pixels);
    expect(height.every(value => value === 0)).toBe(true);
    bead(sim); sim.wet[9 * 32 + 20] = 1;
    paintGlassHeight(sim, height, pixels);
    expect(height[8 * 32 + 12]).toBeGreaterThan(height[8 * 32 + 13]);
    expect(height[8 * 32 + 13]).toBeGreaterThan(0);
    expect(height[9 * 32 + 20]).toBeGreaterThan(height[9 * 32 + 19]);
    // Wet trails must not bleed into neighboring dry pixels.
    expect(height[9 * 32 + 19]).toBe(0);
    expect(height[9 * 32 + 21]).toBe(0);
    expect(height[9 * 32 + 20]).toBeLessThan(height[8 * 32 + 12]);
    expect(height.every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
    sim.drops.length = 0; sim.wet.fill(0); paintGlassHeight(sim, height, pixels);
    expect(height.every(value => value === 0)).toBe(true);
    expect(pixels.filter((_, i) => i % 4 !== 3).every(value => value === 0)).toBe(true);
  });

  it('clips large edge beads without wrapping water onto the opposite edge', () => {
    const sim = new GlassRainSim(32, 16); bead(sim);
    Object.assign(sim.drops[0], { x: -.5, y: 0, size: 6 });
    const heights = new Float32Array(512); paintGlassHeight(sim, heights, new Uint8Array(2048));
    expect(heights[0]).toBeGreaterThan(0);
    for (let y = 0; y < 16; y++) expect(heights[y * 32 + 31]).toBe(0);
  });

  it('captures only visible wet windows and restores renderer state even on failure', () => {
    const stub = rendererStub(), sim = new GlassRainSim(32, 16);
    const source = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial());
    source.position.set(0, 2, -4.55);
    const sourceDisposals = [source.geometry, source.material].map(value => vi.spyOn(value, 'dispose'));
    const water = createGlassWater(stub.asWebGL, 16, 4, 2, sim, [{ mesh: source, garageDepth: -4.33 }]);
    const camera = new THREE.OrthographicCamera(); camera.position.set(0, 6, 8); camera.lookAt(0, 0, 0);
    const heightTexture = water.material.uniforms.uHeight.value as THREE.Texture;
    water.update(palette, 0, false, 0, true); water.render(camera, true);
    expect(stub.renderer.render).not.toHaveBeenCalled(); expect(heightTexture.version).toBe(0);
    bead(sim); water.update(palette, 0, false, 0, true); water.render(camera, false);
    expect(stub.renderer.render).not.toHaveBeenCalled();
    water.render(camera, true, true);
    expect(stub.renderer.render).toHaveBeenCalledTimes(2);
    expect(water.material.uniforms.uExterior.value).not.toBe(water.garageMaterial.uniforms.uExterior.value);
    expect(water.material.uniforms.uHeight).toBe(water.garageMaterial.uniforms.uHeight);
    expect(stub.renderer.getRenderTarget()).toBe(stub.previousTarget);
    expect(stub.renderer.autoClear).toBe(false); expect(stub.renderer.getClearAlpha()).toBe(.4);
    expect(stub.renderer.getClearColor(new THREE.Color()).getHexString()).toBe('123456');
    const uploads = heightTexture.version;
    sim.drops.length = 0; water.update(palette, 0, false, 0, true); water.render(camera, true);
    expect(heightTexture.version).toBe(uploads); expect(stub.renderer.render).toHaveBeenCalledTimes(2);
    bead(sim); water.update(palette, 0, false, 0, true);
    stub.renderer.render.mockImplementationOnce(() => { throw new Error('capture failed'); });
    expect(() => water.render(camera, true)).toThrow('capture failed');
    expect(stub.renderer.getRenderTarget()).toBe(stub.previousTarget);
    expect(stub.renderer.autoClear).toBe(false); expect(stub.renderer.getClearAlpha()).toBe(.4);
    water.dispose(); water.dispose();
    for (const dispose of sourceDisposals) expect(dispose).not.toHaveBeenCalled();
  });

  it('refreshes refracted scenery during camera turns and lightning without advancing the water simulation', () => {
    const stub = rendererStub(), sim = new GlassRainSim(32, 16); bead(sim);
    const water = createGlassWater(stub.asWebGL, 16, 4, 2, sim, []);
    const camera = new THREE.OrthographicCamera(); camera.position.set(0, 6, 8); camera.lookAt(0, 0, 0);
    water.update(palette, 0, false, 0, true); water.render(camera, true);
    const uploads = (water.material.uniforms.uHeight.value as THREE.Texture).version;
    water.render(camera, true); expect(stub.renderer.render).toHaveBeenCalledTimes(1);
    camera.lookAt(0, 3, 0); water.render(camera, true);
    expect(stub.renderer.render).toHaveBeenCalledTimes(2);
    water.update(palette, 0, false, .8, false); water.render(camera, true);
    expect(stub.renderer.render).toHaveBeenCalledTimes(3);
    expect((water.material.uniforms.uHeight.value as THREE.Texture).version).toBe(uploads);
    water.dispose();
  });
});
