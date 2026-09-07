import * as THREE from 'three';

// Wilson's front/side Evolution product photos show two center channels and
// two bowed loops, rather than three great-circle bands:
// https://mas.wilson.com/products/evolution-game-basketball
// This smooth spherical approximation places the side-loop waist at x=±.25.
const BOW = 1 / 15;

/** Approximate angular distance to the classic eight-panel channel network. */
export function basketballChannelDistance(direction: THREE.Vector3) {
  const n = direction.clone().normalize();
  const curve = n.x * n.x - n.y * n.y - BOW * n.z * n.z;
  const gradient = new THREE.Vector3(2 * n.x, -2 * n.y, -2 * BOW * n.z);
  gradient.addScaledVector(n, -gradient.dot(n));
  return Math.min(Math.abs(n.x), Math.abs(n.y), Math.abs(curve) / Math.max(gradient.length(), .15));
}

const surfaceShader = `
varying vec3 vBasketballDirection;
uniform vec3 basketballChannelColor;
float basketballDistance(vec3 n) {
  float curve = n.x * n.x - n.y * n.y - ${BOW.toPrecision(12)} * n.z * n.z;
  vec3 gradient = vec3(2.0 * n.x, -2.0 * n.y, -${(2 * BOW).toPrecision(12)} * n.z);
  gradient -= dot(gradient, n) * n;
  return min(min(abs(n.x), abs(n.y)), abs(curve) / max(length(gradient), 0.15));
}
float basketballPebbles(vec2 p) {
  vec2 cell = floor(p), local = fract(p) - 0.5;
  float jitter = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  local += vec2(jitter - 0.5, fract(jitter * 7.13) - 0.5) * 0.22;
  return 1.0 - smoothstep(0.15, 0.43, length(local));
}
`;

/** One sphere/draw call; all detail follows its object-space surface as it spins. */
export function createBasketballVisual(parent: THREE.Object3D, radius: number) {
  const group = new THREE.Group(); parent.add(group);
  const material = new THREE.MeshStandardMaterial({ color: '#dd641e', roughness: .95, metalness: 0, emissive: '#1b0700' });
  material.onBeforeCompile = shader => {
    shader.uniforms.basketballChannelColor = { value: new THREE.Color('#29221d') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBasketballDirection;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBasketballDirection = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${surfaceShader}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 basketballN = normalize(vBasketballDirection);
        float basketballD = basketballDistance(basketballN);
        float basketballAA = max(fwidth(basketballD) * 0.55, 0.001);
        float basketballGroove = 1.0 - smoothstep(0.018 - basketballAA, 0.027 + basketballAA, basketballD);
        float basketballLip = 1.0 - smoothstep(0.028 - basketballAA, 0.044 + basketballAA, basketballD);
        vec3 basketballWeights = pow(abs(basketballN), vec3(4.0));
        basketballWeights /= dot(basketballWeights, vec3(1.0));
        float basketballGrain = dot(basketballWeights, vec3(
          basketballPebbles(basketballN.yz * 90.0),
          basketballPebbles(basketballN.xz * 90.0),
          basketballPebbles(basketballN.xy * 90.0)));
        // Fade subpixel pebbling instead of letting it shimmer at room scale.
        float basketballFootprint = max(length(dFdx(basketballN)), length(dFdy(basketballN))) * 90.0;
        basketballGrain *= 1.0 - smoothstep(0.3, 1.1, basketballFootprint);
        diffuseColor.rgb *= 0.965 + basketballGrain * 0.055;
        diffuseColor.rgb *= 1.0 - basketballLip * 0.18;
        diffuseColor.rgb = mix(diffuseColor.rgb, basketballChannelColor, basketballGroove);
        float basketballHeight = -0.0008 * basketballGroove + 0.000065 * basketballGrain;
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // A shallow negative height field gives channels recessed shoulders,
        // without raised tubing or changing the ball's silhouette/collision size.
        vec3 basketballQx = dFdx(-vViewPosition), basketballQy = dFdy(-vViewPosition);
        vec3 basketballRx = cross(basketballQy, normal), basketballRy = cross(normal, basketballQx);
        float basketballDet = dot(basketballQx, basketballRx);
        vec3 basketballGradient = sign(basketballDet) * (dFdx(basketballHeight) * basketballRx + dFdy(basketballHeight) * basketballRy);
        normal = normalize(abs(basketballDet) * normal - basketballGradient);
      `);
  };
  material.customProgramCacheKey = () => 'factory-basketball-eight-panels-v1';
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
  sphere.name = 'basketball-surface'; sphere.castShadow = sphere.receiveShadow = true;
  group.add(sphere);
  return group;
}
