import * as THREE from 'three';
import type { SkyPalette } from '../sky/skyPhase';

/** The air between the viewer, distant terrain and clouds shares one palette. */
export function setAtmosphereHaze(target: THREE.Color, palette: SkyPalette, night: boolean) {
  const [r, g, b] = palette.skyHorizon;
  const [sr, sg, sb] = palette.skyTop;
  const upperAir = new THREE.Color().setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
  return target.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
    .lerp(upperAir, night ? 0.35 : 0.62);
}

/** Shared distance haze for terrain, vegetation and objects standing among them. */
export function applyLandscapeHaze(material: THREE.MeshStandardMaterial, haze: { value: THREE.Color }, distance = 0) {
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.landscapeHaze = haze;
    shader.uniforms.landscapeDistance = { value: distance };
    shader.vertexShader = `varying float landscapeDepth;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 atmospherePoint = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        atmospherePoint = instanceMatrix * atmospherePoint;
      #endif
      landscapeDepth = -(modelMatrix * atmospherePoint).z;`,
    );
    shader.fragmentShader = `varying float landscapeDepth;\nuniform vec3 landscapeHaze;\nuniform float landscapeDistance;\n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      `float aerialDepth = max(landscapeDistance, smoothstep(-1.0, 18.0, landscapeDepth) * 0.58);
      outgoingLight = mix(outgoingLight, landscapeHaze, aerialDepth);
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => `${cacheKey}-landscape-haze-${distance}`;
}
