import * as THREE from 'three';
import type { WeatherVisualState } from '../sky/weather';

const FLIGHTS = [
  { count: 5, delay: 3, period: 78, duration: 43, y: 2.35, z: -8, direction: 1, size: 1, glide: false },
  { count: 4, delay: 27, period: 103, duration: 48, y: 3.1, z: -12, direction: -1, size: .8, glide: false },
  { count: 1, delay: 13, period: 91, duration: 58, y: 3.55, z: -9, direction: 1, size: 1.65, glide: true },
] as const;

/** Small staggered flocks and one soaring bird, all in one twenty-triangle draw. */
export function createValleyBirds(scene: THREE.Scene, haze: { value: THREE.Color }) {
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, depthWrite: false });
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .066, .012, 0, .024, -.017, 0], 3));
  const mesh = new THREE.InstancedMesh(wing, material, 20);
  mesh.name = 'valley-birds'; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.visible = false; scene.add(mesh);
  const pose = new THREE.Object3D(), tint = new THREE.Color();
  let time = 0;
  return {
    update(dt: number, weather: WeatherVisualState, night: boolean, paused: boolean) {
      if (!paused) time += Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
      material.opacity = night ? 0 : THREE.MathUtils.clamp(1 - weather.rain01 * 1.8 - weather.snow01 * 1.5, 0, 1);
      mesh.visible = material.opacity > .01 && FLIGHTS.some(flight => time >= flight.delay && (time - flight.delay) % flight.period <= flight.duration);
      if (!mesh.visible) return;
      let instance = 0;
      for (const flight of FLIGHTS) {
        const phase = (time - flight.delay) % flight.period;
        const active = time >= flight.delay && phase <= flight.duration;
        const progress = phase / flight.duration;
        tint.set('#394852').lerp(haze.value, flight.z < -10 ? .58 : .4);
        for (let bird = 0; bird < flight.count; bird++) for (const side of [-1, 1]) {
          pose.position.set(flight.direction * (-9.3 + progress * 19.6 - bird * .22),
            flight.y + Math.sin(phase * .13) * .16 + (bird % 2 ? .07 : -.03), flight.z - bird * .14);
          // The larger bird mostly banks with spread wings; the flocks flap out of phase.
          const flap = flight.glide ? .1 + Math.sin(phase * .7) * .18 : Math.sin(phase * 8 + bird * 1.6) * .65;
          pose.rotation.set(0, 0, side * flap + Math.sin(phase * .4) * .08);
          pose.scale.set(side * flight.size * Number(active), flight.size, flight.size);
          pose.updateMatrix(); mesh.setMatrixAt(instance, pose.matrix); mesh.setColorAt(instance, tint); instance++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); mesh.dispose(); wing.dispose(); material.dispose(); },
  };
}
