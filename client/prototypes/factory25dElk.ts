import * as THREE from 'three';
import type { WeatherVisualState } from '../sky/weather';
import { meadowHeight } from './factory25dLandscape';
import { BearFootsteps } from './factory25dBearGait';

/** A quiet visit to the lower east meadow, clear of the lake and the bear's ridge. */
export class ElkVisit {
  phase: 'waiting' | 'walking' | 'grazing' | 'leaving' = 'waiting';
  x = 9.6;
  z = -.8;
  direction = -1;
  grazing = 0;
  private remaining: number;
  constructor(private random = Math.random) { this.remaining = 6 + random() * 10; }
  get visible() { return this.phase !== 'waiting'; }
  get walking() { return this.phase === 'walking' || this.phase === 'leaving'; }
  update(dt: number, paused = false) {
    if (paused) return;
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, .1) : 0;
    if (this.phase === 'waiting') {
      this.remaining -= dt;
      if (this.remaining <= 0) { this.phase = 'walking'; this.direction = -1; }
    } else if (this.phase === 'grazing') {
      this.grazing += dt;
      if (this.grazing >= 24) { this.phase = 'leaving'; this.direction = 1; }
    } else {
      const goal = this.phase === 'walking' ? 5.4 : 9.6;
      this.x += Math.sign(goal - this.x) * Math.min(Math.abs(goal - this.x), dt * .23);
      if (Math.abs(goal - this.x) < .001) {
        if (this.phase === 'walking') { this.phase = 'grazing'; this.grazing = 0; }
        else { this.phase = 'waiting'; this.remaining = 75 + this.random() * 85; this.z = this.z === -.8 ? -1.2 : -.8; }
      }
    }
  }
}

/** Shared block geometry, two instanced draws, and terrain-planted hooves. */
export function createMeadowElk(scene: THREE.Scene, haze: { value: THREE.Color }, heightAt = meadowHeight) {
  const visit = new ElkVisit(), group = new THREE.Group();
  group.name = 'meadow-elk'; scene.add(group);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  material.onBeforeCompile = shader => {
    shader.uniforms.ridgeHaze = haze;
    shader.fragmentShader = `uniform vec3 ridgeHaze;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>',
      'outgoingLight = mix(outgoingLight, ridgeHaze, 0.19);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'meadow-elk-haze';
  const pieces: { node: THREE.Object3D; color: string }[] = [];
  function part(parent: THREE.Object3D, size: number[], at: number[], color: string) {
    const node = new THREE.Object3D(); node.scale.set(size[0], size[1], size[2]); node.position.set(at[0], at[1], at[2]);
    parent.add(node); pieces.push({ node, color }); return node;
  }
  const herd = [true, false].map((antlers, index) => {
    const rig = new THREE.Group(); rig.scale.setScalar(antlers ? .3 : .265);
    const tan = antlers ? '#a27f53' : '#b4966d', dark = '#51402e';
    part(rig, [.46, .22, .19], [-.03, .36, 0], tan);
    part(rig, [.12, .2, .195], [-.23, .36, 0], '#c6b189'); // pale rump
    part(rig, [.045, .085, .05], [-.3, .38, 0], '#bba27a');
    const neck = new THREE.Group(); neck.position.set(.16, .35, 0); rig.add(neck);
    part(neck, [.13, .26, .155], [.015, .1, 0], dark).rotation.z = -.26;
    const head = new THREE.Group(); head.position.set(.06, .26, 0); neck.add(head);
    part(head, [.17, .105, .1], [.035, 0, 0], tan);
    part(head, [.055, .07, .085], [.14, -.02, 0], dark);
    for (const side of [-1, 1]) {
      part(head, [.1, .027, .052], [-.025, .065, side * .065], tan).rotation.x = side * .3;
      part(head, [.014, .02, .008], [.059, .016, side * .054], '#20251e');
      if (antlers) {
        const beam = part(head, [.024, .25, .025], [-.045, .165, side * .075], '#c7b796'); beam.rotation.z = .4;
        part(head, [.024, .12, .026], [-.1, .3, side * .09], '#c7b796').rotation.z = -.2;
        for (let tine = 0; tine < 3; tine++) {
          part(head, [.075, .018, .018], [-.011 - tine * .035, .17 + tine * .06, side * (.08 + tine * .007)], '#c7b796').rotation.z = .72;
        }
      }
    }
    const legs = [-.185, .12].flatMap(x => [-.067, .067].map(z => ({
      hip: new THREE.Vector3(x, .31, z),
      shin: part(rig, [.036, .27, .039], [x, .155, z], dark),
      hoof: part(rig, [.05, .026, .045], [x, .013, z], '#292a21'),
    })));
    return { rig, neck, legs, gait: new BearFootsteps(heightAt), ready: false, index, facing: Math.PI,
      nominal: legs.map(() => new THREE.Vector3()) };
  });
  const animals = new THREE.InstancedMesh(cube, material, pieces.length);
  animals.name = 'elk-pair'; animals.castShadow = animals.receiveShadow = true; animals.frustumCulled = false;
  animals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pieces.forEach((piece, index) => animals.setColorAt(index, new THREE.Color(piece.color)));
  group.add(animals);
  const shadowGeometry = new THREE.CircleGeometry(1, 10);
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#101a17', transparent: true, opacity: .18, depthWrite: false });
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, 2); shadows.frustumCulled = false; group.add(shadows);
  const shadowPose = new THREE.Object3D(), foot = new THREE.Vector3(), ankle = new THREE.Vector3(), bone = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  group.visible = false;
  let time = 0;
  return {
    resetGround() { herd.forEach(elk => { elk.ready = false; }); },
    update(dt: number, weather: WeatherVisualState, night: boolean, paused: boolean) {
      const sheltered = night || weather.rain01 > .65 || weather.snow01 > .55;
      visit.update(dt, paused || sheltered);
      group.visible = visit.visible && !sheltered;
      if (!visit.visible) herd.forEach(elk => { elk.ready = false; });
      if (!group.visible || paused) return;
      dt = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .1); time += dt;
      for (const elk of herd) {
        const x = visit.x + elk.index * .35, z = visit.z + elk.index * .24;
        elk.rig.position.set(x, heightAt(x, z) + .002, z);
        elk.facing = THREE.MathUtils.damp(elk.facing, visit.direction > 0 ? .08 : Math.PI - .08, 4, dt);
        elk.rig.rotation.y = elk.facing;
        const grazing = visit.phase === 'grazing' && (visit.grazing + elk.index * 3) % 9 < 6;
        elk.neck.rotation.z = THREE.MathUtils.damp(elk.neck.rotation.z, grazing ? -2.18 + Math.sin(time * 2) * .025 : 0, 3, dt);
        elk.rig.updateMatrixWorld(true);
        elk.legs.forEach((leg, i) => elk.nominal[i].set(leg.hip.x, 0, leg.hip.z).applyMatrix4(elk.rig.matrixWorld));
        if (!elk.ready) { elk.gait.reset(elk.nominal); elk.ready = true; }
        const feet = elk.gait.update(dt, elk.nominal, { x: visit.direction, z: 0 }, visit.walking);
        elk.legs.forEach((leg, i) => {
          foot.set(feet[i].x, feet[i].y + .001, feet[i].z); elk.rig.worldToLocal(foot);
          leg.hoof.position.copy(foot).y += .013;
          ankle.copy(foot).y += .026; bone.subVectors(leg.hip, ankle);
          leg.shin.position.copy(ankle).addScaledVector(bone, .5); leg.shin.scale.y = bone.length();
          leg.shin.quaternion.setFromUnitVectors(up, bone.normalize());
        });
        elk.rig.updateMatrixWorld(true);
        shadowPose.position.copy(elk.rig.position); shadowPose.position.y += .002;
        shadowPose.rotation.set(-Math.PI / 2, 0, 0); shadowPose.scale.set(.1, .043, 1); shadowPose.updateMatrix();
        shadows.setMatrixAt(elk.index, shadowPose.matrix);
      }
      pieces.forEach((piece, index) => animals.setMatrixAt(index, piece.node.matrixWorld));
      animals.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
    },
    dispose() { group.removeFromParent(); animals.dispose(); shadows.dispose(); cube.dispose(); material.dispose(); shadowGeometry.dispose(); shadowMaterial.dispose(); },
  };
}
