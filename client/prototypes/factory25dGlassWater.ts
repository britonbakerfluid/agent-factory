import * as THREE from 'three';
import { glassDropRadius, GLASS_SPLAT_S, type GlassRainSim } from '../sky/rain';
import type { SkyPalette } from '../sky/skyPhase';

/** A height field, not white artwork: its slopes become little water lenses. */
export function paintGlassHeight(sim: GlassRainSim, height: Float32Array, pixels: Uint8Array) {
  const { width, height: rows, wet } = sim;
  if (height.length !== width * rows || pixels.length !== width * rows * 4) throw new RangeError('Glass buffers must match the simulation');
  height.fill(0);
  for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    // Keep the lingering wet film separate from bead height so it remains visible
    // even over a featureless patch of sky, without bright specular squiggles.
    const film = wet[i];
    height[i] = film * .24;
    pixels[i * 4 + 1] = Math.round(film * 255);
    pixels[i * 4 + 2] = 0;
  }
  for (const drop of sim.drops) {
    const radius = glassDropRadius(drop.size);
    const stretch = 1 + Math.min(.16, drop.vy / (420 * sim.rasterScale));
    const impact = Math.max(0, 1 - drop.age / GLASS_SPLAT_S);
    const rx = radius * (1 + impact * .3), ry = radius * stretch;
    for (let y = Math.max(0, Math.floor(drop.y - ry)); y <= Math.min(rows - 1, Math.ceil(drop.y + ry)); y++) {
      for (let x = Math.max(0, Math.floor(drop.x - rx)); x <= Math.min(width - 1, Math.ceil(drop.x + rx)); x++) {
        const r2 = ((x - drop.x) / rx) ** 2 + ((y - drop.y) / ry) ** 2;
        if (r2 >= 1) continue;
        const cap = Math.pow(1 - r2, .7) * Math.min(.95, .34 + drop.size * .105);
        height[y * width + x] = Math.max(height[y * width + x], cap);
        const i = (y * width + x) * 4 + 2;
        pixels[i] = Math.max(pixels[i], Math.round(Math.pow(1 - r2, .45) * 255));
      }
    }
  }
  for (let i = 0; i < height.length; i++) {
    const value = Math.round(Math.min(1, Math.max(0, height[i])) * 255);
    pixels[i * 4] = value; pixels[i * 4 + 3] = 255;
  }
}

/** Compose only existing exterior quads; never render the whole room a second time. */
export function createGlassWater(renderer: THREE.WebGLRenderer, width: number, worldHeight: number, centerY: number,
  sim: GlassRainSim, sources: readonly { mesh: THREE.Mesh; garageDepth?: number }[]) {
  const heights = new Float32Array(sim.width * sim.height);
  const pixels = new Uint8Array(sim.width * sim.height * 4);
  const texture = new THREE.DataTexture(pixels, sim.width, sim.height);
  // Keep the wet film and bead shading on the scene's crisp pixel grid.
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const target = new THREE.WebGLRenderTarget(1024, Math.round(1024 * worldHeight / width), {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false,
  });
  const garageTarget = target.clone();
  const exterior = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, worldHeight / 2, -worldHeight / 2, .1, 20);
  camera.position.set(0, centerY, 5); camera.lookAt(0, centerY, -4.5);
  const copies = sources.map(({ mesh: source, garageDepth }) => {
    const copy = source.clone(false); exterior.add(copy); return { source, copy, garageDepth };
  });
  const material = new THREE.ShaderMaterial({
    name: 'Refracting window rain', transparent: true, depthWrite: false,
    uniforms: {
      uHeight: { value: texture }, uExterior: { value: target.texture },
      uTexel: { value: new THREE.Vector2(1 / sim.width, 1 / sim.height) },
      uGlint: { value: new THREE.Color('#d7e6fa') }, uLight: { value: new THREE.Vector3(-.4, .7, 1).normalize() },
      uLightning: { value: 0 }, uNight: { value: 0 }, uActive: { value: 0 },
      // A local-only comparison knob is supplied by the caller, never shared weather.
      uRefraction: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uHeight, uExterior;
      uniform vec2 uTexel;
      uniform vec3 uGlint, uLight;
      uniform float uActive, uNight, uLightning, uRefraction;
      varying vec2 vUv;
      float water(vec2 uv) { return texture2D(uHeight, vec2(uv.x, 1.0-uv.y)).r; }
      void main() {
        if (uActive < .5) discard;
        vec3 waterData = texture2D(uHeight, vec2(vUv.x,1.0-vUv.y)).rgb;
        float h = waterData.r;
        if (h < .007) discard;
        vec2 slope = vec2(water(vUv+vec2(uTexel.x,0))-water(vUv-vec2(uTexel.x,0)),
                          water(vUv+vec2(0,uTexel.y))-water(vUv-vec2(0,uTexel.y))) * .5;
        // Pixel-sized offsets preserve the art; only water bends the view.
        vec2 offset = slope * uTexel * 8.0 * uRefraction;
        vec2 sampleUv = clamp(vUv-offset, uTexel, vec2(1.0)-uTexel);
        vec4 background = texture2D(uExterior, sampleUv);
        if (background.a < .05) discard;
        vec3 color = background.rgb;
        vec3 normal = normalize(vec3(-slope*3.8, .65));
        float edge = smoothstep(.008,.11,length(slope));
        float bead = smoothstep(.12,.7,waterData.b);
        float trail = waterData.g * (1.0-bead);
        float spec = pow(max(0.0,dot(normal,uLight)),34.0) * edge * bead;
        // Give the rounded bead a compact optical rim, not a bright stroke along
        // its entire trail. The clear middle still shows the refracted scenery.
        float rim = edge * bead * (1.0-smoothstep(.76,.98,waterData.b));
        float underside = smoothstep(-.02,.1,slope.y);
        color *= 1.0 - edge*.025 - rim*(.09 + underside*.10);
        // A restrained sky reflection reveals the path behind each drop. The
        // trail stays put and fades with wetness; highlights belong to the bead.
        color = mix(color,uGlint,trail*.16*mix(1.0,.4,uNight));
        color += uGlint * spec * (.24 + uLightning*.5) * mix(1.0,.45,uNight);
        // A one-pixel bead has no measurable slope; retain a tiny point glint.
        color += uGlint * bead * (1.0-edge) * .055 * mix(1.0,.45,uNight);
        float alpha = smoothstep(.007,.1,h);
        gl_FragColor = vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const garageMaterial = material.clone();
  garageMaterial.uniforms = { ...material.uniforms, uExterior: { value: garageTarget.texture } };
  const direction = new THREE.Vector3(), clear = new THREE.Color();
  const previousDirection = new THREE.Vector3();
  const glintTint = new THREE.Color('#d8eaff');
  let dirty = false, disposed = false, captureElapsed = 0;
  return {
    material, garageMaterial,
    update(palette: SkyPalette, arc: number, night: boolean, lightning: number, repaint: boolean, dt = 0) {
      captureElapsed += dt;
      if (Math.abs(material.uniforms.uLightning.value - lightning) > .005) dirty = true;
      material.uniforms.uLightning.value = lightning;
      material.uniforms.uNight.value = night ? 1 : 0;
      material.uniforms.uLight.value.set(-arc / 10, .7, 1).normalize();
      material.uniforms.uGlint.value.setRGB(palette.sunGlow[0]/255, palette.sunGlow[1]/255, palette.sunGlow[2]/255, THREE.SRGBColorSpace)
        .lerp(glintTint, .65);
      if (!repaint) return;
      if (sim.isDry) { material.uniforms.uActive.value = 0; dirty = false; return; }
      material.uniforms.uActive.value = 1;
      paintGlassHeight(sim, heights, pixels); texture.needsUpdate = true; dirty = true;
    },
    render(viewCamera: THREE.Camera, factoryVisible: boolean, garageVisible = false) {
      if ((!factoryVisible && !garageVisible) || material.uniforms.uActive.value === 0 || disposed) return;
      viewCamera.getWorldDirection(direction);
      if (!dirty && captureElapsed < 1 / 30 && direction.distanceToSquared(previousDirection) < 1e-9) return;
      const z = Math.abs(direction.z) < .05 ? -.05 : direction.z;
      const previous = renderer.getRenderTarget(), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear;
      renderer.getClearColor(clear);
      try {
        for (const garage of [false, true]) {
          if (garage ? !garageVisible : !factoryVisible) continue;
          for (const { source, copy, garageDepth } of copies) {
            copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.scale.copy(source.scale);
            copy.visible = source.visible && (!garage || garageDepth !== undefined);
            // Match each room's actual pane depth and panorama scale, so dry/wet
            // edges stay aligned during close-ups and both floors' travel views.
            const shift = garage ? (-4.31 - (garageDepth ?? -4.31)) / (18 / width) : -4.42 - source.position.z;
            copy.position.x += shift * direction.x / z;
            copy.position.y += shift * direction.y / z;
            if (garage && garageDepth !== undefined) copy.position.z = garageDepth;
          }
          renderer.setRenderTarget(garage ? garageTarget : target); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
          renderer.clear(); renderer.render(exterior, camera);
        }
      } finally {
        renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha); renderer.autoClear = autoClear;
      }
      dirty = false;
      captureElapsed = 0; previousDirection.copy(direction);
    },
    dispose() { if (disposed) return; disposed = true; material.dispose(); garageMaterial.dispose(); texture.dispose(); target.dispose(); garageTarget.dispose(); exterior.clear(); },
  };
}
