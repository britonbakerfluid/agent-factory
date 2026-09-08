import * as THREE from 'three';
import { CLOUD_LAYER_PLAN } from '../sky/cloudLayers';
import { BackRainSim, GlassRainSim, paintBackRain, RAIN_THRESHOLD } from '../sky/rain';
import { createSkylineGeometry, paintWindowWeather, PixelBuffer } from '../sky/skylinePainter';
import { lerpRgb } from '../sky/skyPhase';
import type { SkyPalette } from '../sky/skyPhase';
import { cloudLayerWeights } from '../sky/weather';
import type { WeatherVisualState } from '../sky/weather';
import { createCloudVolume, cloudStyleFromSearch } from './factory25dCloudVolume';
import { cloudFigureFromSearch } from './factory25dCloudFigure';
import { createGlassWater } from './factory25dGlassWater';

/** A Three.js view of the existing factory cloud, snow and wet-glass models. */
export function createWindowWeather(scene: THREE.Scene, renderer: THREE.WebGLRenderer, width: number, height: number, centerY: number,
  exterior: readonly { mesh: THREE.Mesh; garageDepth?: number }[] = []) {
  const pixelWidth = 640;
  const pixelHeight = Math.round(pixelWidth * height / width);
  // Rain needs finer pixels than the distant landscape, especially in close-up.
  const rainScale = 2;
  const rainWidth = pixelWidth * rainScale;
  const rainHeight = Math.round(rainWidth * height / width);
  const geometry = createSkylineGeometry(pixelWidth, pixelHeight);
  const rain = new BackRainSim(rainWidth, rainHeight, undefined, rainScale);
  const glass = new GlassRainSim(rainWidth, rainHeight, undefined, rainScale);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const plane = new THREE.PlaneGeometry(width, height);
  const loader = new THREE.TextureLoader();
  const style = import.meta.env.DEV ? cloudStyleFromSearch(location.search) : 'volume';
  const clouds = (style === 'painted' ? CLOUD_LAYER_PLAN : []).map((spec, index) => {
    const filename = spec.texture.replace('sky_', '').replaceAll('_', '-');
    const texture = loader.load(`/skyline/${filename}.png`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.offset.x = index * 0.18;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
    // Like the live factory's snow tint-fill: lift the dark cloud pixels while
    // keeping the artwork's alpha and internal shape, rather than only tinting
    // their already-dark colors against a bright whiteout.
    const snowLift = { value: 0 };
    const snowColor = { value: new THREE.Color('#cdd9ed') };
    material.onBeforeCompile = shader => {
      shader.uniforms.snowLift = snowLift;
      shader.uniforms.snowColor = snowColor;
      shader.fragmentShader = `uniform float snowLift;\nuniform vec3 snowColor;\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowLift);');
    };
    material.customProgramCacheKey = () => 'factory-weather-cloud-snow';
    const mesh = new THREE.Mesh(plane, material);
    // The nearest bank can drift across the peaks; all rain stays behind the
    // frame and the floor plants, inside exactly the same glass rectangle.
    mesh.position.set(0, centerY, index === 4 ? -4.53 : -4.61 + index * 0.012);
    scene.add(mesh);
    return { spec, texture, material, snowLift, snowColor, mesh };
  });
  // Local A/B comparison without opening a second GPU-heavy scene.
  const cloudyBillows = !(import.meta.env.DEV && new URLSearchParams(location.search).get('cloudShape') === 'legacy');
  const volume = createCloudVolume(renderer, width, height, cloudyBillows,
    import.meta.env.DEV ? cloudFigureFromSearch(location.search) : 'auto');
  const volumeMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: volume.texture, transparent: true, depthWrite: false }));
  volumeMesh.position.set(0, centerY, -4.57);
  scene.add(volumeMesh);
  clouds.forEach(cloud => { cloud.mesh.visible = style === 'painted'; });
  volumeMesh.visible = style === 'volume';

  function pixelLayer(z: number, columns = pixelWidth, rows = pixelHeight) {
    const pixels = new PixelBuffer(columns, rows);
    // The painter already owns RGBA bytes. Upload those directly instead of
    // copying a full ImageData and then copying it through a 2D canvas every tick.
    const texture = new THREE.DataTexture(pixels.data, columns, rows);
    texture.flipY = true; // Match the previous canvas texture's top-left pixel origin.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true; // Garage windows may share this initially transparent texture.
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.position.set(0, centerY, z);
    mesh.visible = false;
    scene.add(mesh);
    return {
      pixels,
      mesh,
      dispose() { texture.dispose(); mesh.material.dispose(); mesh.removeFromParent(); },
      upload() {
        texture.needsUpdate = true;
      },
    };
  }
  const outside = pixelLayer(-4.49, rainWidth, rainHeight);
  // Falling rain is behind the glass. Keep its contrast lower than the nearby
  // beads and stationary trails, while preserving the crisp pixel edges.
  outside.mesh.material.opacity = .48;
  const windowSurface = pixelLayer(-4.415);
  const water = createGlassWater(renderer, width, height, centerY, glass,
    [...exterior, ...clouds.map(cloud => ({ mesh: cloud.mesh, garageDepth: -4.34 })),
      { mesh: volumeMesh, garageDepth: -4.34 }, { mesh: outside.mesh, garageDepth: -4.32 }]);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('glassRefraction') === 'off') water.material.uniforms.uRefraction.value = 0;
  const waterMesh = new THREE.Mesh(plane, water.material);
  waterMesh.name = 'window-refracting-rain'; waterMesh.position.set(0, centerY, -4.42); scene.add(waterMesh);
  const mirrors: Array<{source: THREE.Mesh; copy: THREE.Mesh}> = [];
  let accumulated = 0;
  let outsideAccumulated = 0;
  let motionTime = 0;
  let glassActive = false;
  let outsideBlank = true, surfaceBlank = true;
  return {
    cloudMaterial: style === 'volume' ? volumeMesh.material : undefined,
    windowMaterials: { outsideMaterial: outside.mesh.material, glassMaterial: water.garageMaterial, surfaceMaterial: windowSurface.mesh.material },
    renderRefraction: water.render,
    dispose() {
      water.dispose(); waterMesh.removeFromParent(); outside.dispose(); windowSurface.dispose();
      for (const cloud of clouds) { cloud.texture.dispose(); cloud.material.dispose(); cloud.mesh.removeFromParent(); }
      for (const { copy } of mirrors) copy.removeFromParent();
      volumeMesh.material.dispose(); volumeMesh.removeFromParent(); plane.dispose(); volume.dispose();
    },
    mirrorOutside(parent: THREE.Scene, x: number) {
      // Share sky/cloud textures, but never copy the glass droplet surface outdoors.
      for (const source of [...clouds.map(cloud => cloud.mesh), volumeMesh, outside.mesh]) {
        const copy = source.clone(); copy.position.x += x; parent.add(copy); mirrors.push({source, copy});
      }
    },
    update(dt: number, weather: WeatherVisualState, palette: SkyPalette, arc = -3, night = false, visible = true, lightning = 0) {
      if (!Number.isFinite(dt)) return;
      mirrors.forEach(({source, copy}) => { copy.visible = source.visible; });
      const step = Math.min(Math.max(dt, 0), 0.1);
      const motionScale = reducedMotion.matches ? 0.2 : 1;
      volume.update(step * motionScale, weather, palette, arc, night, style === 'volume' && visible && !document.hidden,lightning);
      motionTime += step * motionScale;
      if (!visible || document.hidden) { accumulated = 1 / 30; outsideAccumulated = 0; return; }
      const weights = cloudLayerWeights(weather);
      for (const { spec, material, texture, snowLift, snowColor } of clouds) {
        texture.offset.x += spec.drift * (0.55 + weather.wind01 * 1.8) * step * motionScale / pixelWidth;
        const tint = lerpRgb(palette.cloud, palette.skyHorizon, spec.horizonMix);
        material.color.setRGB(tint[0] / 255, tint[1] / 255, tint[2] / 255, THREE.SRGBColorSpace);
        snowLift.value = weather.snow01 * 0.64;
        const lift = lerpRgb(palette.skyHorizon, [210, 224, 244], 0.62);
        snowColor.value.setRGB(lift[0] / 255, lift[1] / 255, lift[2] / 255, THREE.SRGBColorSpace);
        material.opacity = Math.min(0.88, weather.cloud01 * spec.weight(weights) * spec.alpha * (1 + weather.snow01 * 0.5));
      }
      accumulated += step;
      outsideAccumulated += Math.min(Math.max(dt, 0), 0.25);
      water.update(palette, arc, night, lightning, false, step);
      if (accumulated < (reducedMotion.matches ? 0.25 : 1 / 30)) return;
      rain.step(outsideAccumulated * motionScale, weather);
      // Once the last trail dries, leave the 1280-wide wetness grid alone until
      // precipitation resumes. Its drainage and painter are otherwise unchanged.
      if (glassActive || weather.rain01 > RAIN_THRESHOLD) {
        glass.step(accumulated * motionScale, weather);
        glassActive = !glass.isDry;
        water.update(palette, arc, night, lightning, true);
      }
      accumulated = 0;
      outsideAccumulated = 0;
      const raining = rain.streaks.length > 0, snowing = weather.snow01 > 0.02;
      if (raining || !outsideBlank) {
        outside.pixels.data.fill(0);
        if (raining) paintBackRain(outside.pixels, rain, palette, weather);
        outside.upload(); outsideBlank = !raining;
      }
      if (snowing || !surfaceBlank) {
        windowSurface.pixels.data.fill(0);
        // A continuous phase avoids snow jumping when rain/snow are blended.
        // Snow keeps its own layer; rain highlights now come from curved water.
        if (snowing) paintWindowWeather(windowSurface.pixels, geometry, { palette }, { ...weather, wet01: 0 }, motionTime / 12);
        windowSurface.upload(); surfaceBlank = !snowing;
      }
      outside.mesh.visible = raining;
      windowSurface.mesh.visible = snowing;
    },
  };
}
