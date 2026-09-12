import * as THREE from 'three';

/** Surface-only shimmer: native hit targets drive the same feedback for mouse and keyboard. */
export function createInteractionGlow(root: THREE.Object3D, target: HTMLElement) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  const amount = { value: 0 }, clock = { value: 0 };
  let hovered = false, focused = false, last = performance.now(), lastFrame = -1;
  const restores: (() => void)[] = [];
  target.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') hovered = true; }, events);
  target.addEventListener('pointerleave', () => { hovered = false; }, events);
  target.addEventListener('focus', () => { focused = target.matches(':focus-visible'); }, events);
  target.addEventListener('blur', () => { focused = false; }, events);
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const original = node.material, before = node.onBeforeRender;
    const materials = (Array.isArray(original) ? original : [original]).map(material => {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) || material.opacity < .9) return material;
      const copy = material.clone();
      copy.onBeforeCompile = shader => {
        shader.uniforms.factoryHover = amount; shader.uniforms.factoryHoverTime = clock;
        shader.vertexShader = 'varying vec3 factoryHoverPosition;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfactoryHoverPosition = position;');
        shader.fragmentShader = 'uniform float factoryHover; uniform float factoryHoverTime; varying vec3 factoryHoverPosition;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float sweep = pow(max(0.0, sin(factoryHoverPosition.y * 9.0 + factoryHoverPosition.x * 5.0 - factoryHoverTime * 1.2)), 4.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.90, 0.78), factoryHover * (0.03 + sweep * 0.08));`);
      };
      copy.customProgramCacheKey = () => 'factory-interaction-glow-v2';
      return copy;
    });
    node.material = Array.isArray(original) ? materials : materials[0];
    node.onBeforeRender = function (...args) {
      before.apply(this, args);
      if (lastFrame === args[0].info.render.frame) return;
      lastFrame = args[0].info.render.frame;
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      const active = !target.hidden && !target.matches(':disabled') && !target.closest('[inert]') && !document.querySelector('dialog[open]') && (hovered || focused);
      amount.value = reduced.matches || focused ? Number(active) : THREE.MathUtils.lerp(amount.value, Number(active), 1 - Math.exp(-dt * 18));
      clock.value = reduced.matches || focused ? 0 : now / 1000;
    };
    restores.push(() => { node.material = original; node.onBeforeRender = before; materials.forEach((material, i) => { if (material !== (Array.isArray(original) ? original[i] : original)) material.dispose(); }); });
  });
  return { dispose() { abort.abort(); restores.forEach(restore => restore()); } };
}
