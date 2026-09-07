import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cloudStyleFromSearch, createCloudVolume } from '../client/prototypes/factory25dCloudVolume';
import { CLEAR_WEATHER, type WeatherVisualState } from '../client/sky/weather';
import { paletteForElevation } from '../client/sky/skyPhase';

const day = paletteForElevation(45, false);
const cloudy: WeatherVisualState = { ...CLEAR_WEATHER, cloud01: .72, cloudForm01: .52 };
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()); });

function fixture(previousTarget: THREE.WebGLRenderTarget | null = null) {
  let target = previousTarget, alpha = .37;
  const clearColor = new THREE.Color('#264970');
  const frames: Array<{
    quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    target: THREE.WebGLRenderTarget;
    color: THREE.Color;
    alpha: number;
  }> = [];
  const renderer = {
    getRenderTarget: vi.fn(() => target),
    getClearAlpha: vi.fn(() => alpha),
    getClearColor: vi.fn((result: THREE.Color) => result.copy(clearColor)),
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { target = next; }),
    setClearColor: vi.fn((color: THREE.ColorRepresentation, nextAlpha: number) => { clearColor.set(color); alpha = nextAlpha; }),
    render: vi.fn((scene: THREE.Scene) => {
      frames.push({
        quad: scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>,
        target: target!, color: clearColor.clone(), alpha,
      });
    }),
  };
  const volume = createCloudVolume(renderer as unknown as THREE.WebGLRenderer, 15.84, 3.598);
  cleanup.push(() => volume.dispose());
  return { volume, renderer, frames, current: () => ({ target, color: clearColor.clone(), alpha }) };
}

describe('volumetric window clouds', () => {
  it('lights the density volume on the strike frame and clears it promptly after the pulse',()=>{
    const {volume,frames}=fixture();
    volume.update(0,cloudy,day,0,false,true);
    volume.update(.01,cloudy,day,0,false,true,.8);
    expect(frames).toHaveLength(2);
    expect(frames.at(-1)!.quad.material.uniforms.cloudFlash.value).toBe(.8);
    volume.update(.01,cloudy,day,0,false,true,0);
    expect(frames).toHaveLength(3);
    expect(frames.at(-1)!.quad.material.uniforms.cloudFlash.value).toBe(0);
  });
  it.each(['', '?weather=rain', '?clouds=volume', '?clouds=unknown'])('defaults preview %s to volume with painted as an explicit fallback', search => {
    expect(cloudStyleFromSearch(search)).toBe('volume');
    expect(cloudStyleFromSearch('?weather=rain&clouds=painted')).toBe('painted');
  });

  it('does no offscreen renderer work, caps active rendering at 12 Hz, and refreshes on return', () => {
    const { volume, renderer, frames } = fixture();
    for (let i = 0; i < 120; i++) volume.update(1 / 60, cloudy, day, 0, false, false);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.getRenderTarget).not.toHaveBeenCalled();
    volume.update(0, cloudy, day, 0, false, true);
    expect(frames).toHaveLength(1);
    const renderedAt = [0];
    for (let i = 1; i <= 240; i++) {
      const count = frames.length;
      volume.update(1 / 120, cloudy, day, 0, false, true);
      if (frames.length !== count) renderedAt.push(i / 120);
    }
    expect(renderedAt.length).toBeLessThanOrEqual(25);
    expect(renderedAt.length).toBeGreaterThan(20);
    for (let i = 1; i < renderedAt.length; i++) expect(renderedAt[i] - renderedAt[i - 1]).toBeGreaterThanOrEqual(1 / 12 - 1e-10);
    const previousFrames = frames.length;
    volume.update(10, cloudy, day, 0, false, false);
    expect(frames).toHaveLength(previousFrames);
    volume.update(0, { ...cloudy, rain01: 1 }, day, 0, false, true);
    expect(frames).toHaveLength(previousFrames + 1);
    expect(frames.at(-1)!.quad.material.uniforms.cloudDeck.value).toBe(1);
  });

  it.each([false, true])('restores the prior renderer target, clear color and alpha (nested pass: %s)', nested => {
    const previousTarget = nested ? new THREE.WebGLRenderTarget(8, 8) : null;
    if (previousTarget) cleanup.push(() => previousTarget.dispose());
    const { volume, frames, current } = fixture(previousTarget);
    const before = current();
    volume.update(1, cloudy, day, -1, false, true);
    expect(frames[0].target.texture).toBe(volume.texture);
    expect(frames[0].target).not.toBe(previousTarget);
    expect(frames[0].color.equals(new THREE.Color(0))).toBe(true);
    expect(frames[0].alpha).toBe(0);
    expect(current().target).toBe(previousTarget);
    expect(current().color.equals(before.color)).toBe(true);
    expect(current().alpha).toBe(before.alpha);
  });

  it('creates a deterministic 32 KiB density texture and reuses its data and render target across frames', () => {
    const first = fixture(), second = fixture();
    first.volume.update(0, cloudy, day, 0, false, true);
    second.volume.update(0, cloudy, day, 0, false, true);
    const noise = first.frames[0].quad.material.uniforms.cloudNoise.value as THREE.Data3DTexture;
    const otherNoise = second.frames[0].quad.material.uniforms.cloudNoise.value as THREE.Data3DTexture;
    const data = noise.image.data as Uint8Array;
    expect(noise).toBeInstanceOf(THREE.Data3DTexture);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.byteLength).toBe(32 * 1024);
    expect([noise.image.width, noise.image.height, noise.image.depth]).toEqual([32, 32, 32]);
    expect(new Set(data).size).toBeGreaterThan(200);
    expect(otherNoise).not.toBe(noise);
    expect(otherNoise.image.data).toEqual(data);
    const initialBytes = data.slice();
    for (let i = 0; i < 5; i++) first.volume.update(.1, cloudy, day, i / 4, false, true);
    for (const frame of first.frames) {
      expect(frame.quad.material.uniforms.cloudNoise.value).toBe(noise);
      expect(frame.target).toBe(first.frames[0].target);
    }
    expect(noise.image.data).toBe(data);
    expect(data).toEqual(initialBytes);
  });

  it('updates lighting from the current palette, night state and sun arc', () => {
    const { volume, frames } = fixture();
    volume.update(.1, cloudy, day, -2, false, true);
    const uniforms = frames[0].quad.material.uniforms;
    const sunlit = (uniforms.cloudLit.value as THREE.Color).clone();
    const morningLight = (uniforms.cloudLight.value as THREE.Vector3).clone();
    expect(morningLight.x).toBeLessThan(0);
    expect(morningLight.y).toBeGreaterThan(0);
    expect(morningLight.length()).toBeCloseTo(1);
    volume.update(.1, cloudy, day, 2, true, true);
    expect(uniforms.cloudLight.value.x).toBeGreaterThan(0);
    expect(uniforms.cloudLight.value.length()).toBeCloseTo(1);
    expect(uniforms.cloudLit.value.equals(sunlit)).toBe(false);
    const unlitDay = uniforms.cloudLit.value.clone();
    const dayShade = uniforms.cloudShade.value.clone();
    const night = paletteForElevation(-20, false);
    volume.update(.1, cloudy, night, 2, true, true);
    expect(uniforms.cloudLit.value.equals(unlitDay)).toBe(false);
    expect(uniforms.cloudShade.value.equals(dayShade)).toBe(false);
    expect(uniforms.cloudLit.value.r + uniforms.cloudLit.value.g + uniforms.cloudLit.value.b)
      .toBeLessThan(unlitDay.r + unlitDay.g + unlitDay.b);
  });

  it('responds to cover, rain, snow, cloud form and wind without replacing uniforms', () => {
    const { volume, frames } = fixture();
    volume.update(1, { ...CLEAR_WEATHER, wind01: 0 }, day, 0, false, true);
    const uniforms = frames[0].quad.material.uniforms;
    expect(uniforms.cloudCover.value).toBe(0);
    expect(uniforms.cloudDeck.value).toBe(0);
    const calmAdvance = uniforms.cloudTime.value;
    volume.update(1, { ...cloudy, wind01: 1, rain01: 1 }, day, 0, false, true);
    expect(uniforms.cloudCover.value).toBe(cloudy.cloud01);
    expect(uniforms.cloudDeck.value).toBe(1);
    expect(uniforms.cloudTime.value - calmAdvance).toBeGreaterThan(calmAdvance);
    volume.update(.1, { ...cloudy, rain01: 0, snow01: 1 }, day, 0, false, true);
    expect(uniforms.cloudDeck.value).toBe(1);
    volume.update(.1, { ...CLEAR_WEATHER, cloud01: 1, cloudForm01: 1 }, day, 0, false, true);
    expect(uniforms.cloudDeck.value).toBe(1);
    volume.update(.1, CLEAR_WEATHER, day, 0, false, true);
    expect(uniforms.cloudCover.value).toBe(0);
    expect(uniforms.cloudDeck.value).toBe(0);
    expect(frames.at(-1)!.quad.material.uniforms).toBe(uniforms);
  });

  it('disposes its noise, target, material and geometry once, then ignores updates', () => {
    const previousTarget = new THREE.WebGLRenderTarget(8, 8);
    cleanup.push(() => previousTarget.dispose());
    const { volume, frames, renderer } = fixture(previousTarget);
    volume.update(.1, cloudy, day, 0, false, true);
    const { quad, target } = frames[0];
    const uniforms = quad.material.uniforms, time = uniforms.cloudTime.value;
    const protectedDispose = vi.spyOn(previousTarget, 'dispose');
    const owned = [uniforms.cloudNoise.value as THREE.Data3DTexture, target, quad.material, quad.geometry];
    const disposals = owned.map(resource => vi.spyOn(resource, 'dispose'));
    volume.dispose(); volume.dispose();
    volume.update(10, { ...cloudy, rain01: 1 }, day, 2, true, true);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
    expect(protectedDispose).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(uniforms.cloudTime.value).toBe(time);
    expect(uniforms.cloudDeck.value).toBe(0);
  });
});
