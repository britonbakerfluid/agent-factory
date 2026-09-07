import * as THREE from 'three';
import type { GarageDriveCar, GarageTireMark } from '@shared/factory25d-driving';

export const GARAGE_VISUAL_MARK_LIMIT = 512;
const FLOOR_Y = .022; // Above the slab and the .0195-high parking paint.
const MAX_ROLL = .024, MAX_PITCH = .018, MAX_STEER = .98;
const DELOREAN_HOVER_HEIGHT = 1.45;
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const PAINT_NAMES = new Set(['Porsche · ivory', 'Mini · racing green', 'DeLorean · brushed steel', 'F1 · racing coral']);
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = THREE.MathUtils.clamp;
type Wheel = { node: THREE.Object3D; steering: THREE.Object3D; rotation: THREE.Quaternion; steeringRotation: THREE.Quaternion;
  steeringPosition: THREE.Vector3; radius: number; front: boolean; phase: number };
type Paint = { original: THREE.MeshStandardMaterial; material: THREE.MeshStandardMaterial };
type Rig = {
  root: THREE.Group; vehicle: THREE.Object3D; body: THREE.Group; children: THREE.Object3D[];
  wheels: Wheel[]; paints: Paint[]; glows: Paint[]; materials: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[];
  wheelbase: number; pivotY: number; steer: number; impact: number; damage: number; forward: number;
  state?: GarageDriveCar;
};

/** A small shared alpha map gives rubber soft shoulders and broken, dry grain. */
function rubberTexture() {
  const size = 32, pixels = new Uint8Array(size * size * 4);
  let seed = 7301;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const edge = Math.min(1, x / 4, (size - 1 - x) / 4);
    const groove = x % 7 === 0 ? .54 : 1;
    const alpha = Math.round(255 * edge * groove * (.64 + (seed / 0xffffffff) * .36));
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = alpha; pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function validMark(mark: GarageTireMark) {
  return [mark.id, mark.x1, mark.z1, mark.x2, mark.z2, mark.width, mark.opacity, mark.createdAt].every(Number.isFinite)
    && mark.width > 0 && mark.opacity > 0 && Math.hypot(mark.x2 - mark.x1, mark.z2 - mark.z1) > .0001;
}
function sameMark(a: GarageTireMark | undefined, b: GarageTireMark) {
  return a?.id === b.id && a.x1 === b.x1 && a.z1 === b.z1 && a.x2 === b.x2 && a.z2 === b.z2
    && a.width === b.width && a.opacity === b.opacity && a.createdAt === b.createdAt;
}

/** Server-authored garage-local tracks; this module never creates driving events or moves a car root. */
export function createGarageDriveVisuals(room: THREE.Group, cars: Map<string, THREE.Group>) {
  const positions = new THREE.BufferAttribute(new Float32Array(GARAGE_VISUAL_MARK_LIMIT * 12), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(GARAGE_VISUAL_MARK_LIMIT * 16), 4).setUsage(THREE.DynamicDrawUsage);
  const uvs = new THREE.BufferAttribute(new Float32Array(GARAGE_VISUAL_MARK_LIMIT * 8), 2).setUsage(THREE.DynamicDrawUsage);
  const born = new THREE.BufferAttribute(new Float32Array(GARAGE_VISUAL_MARK_LIMIT * 4), 1).setUsage(THREE.DynamicDrawUsage);
  const normals = new Float32Array(GARAGE_VISUAL_MARK_LIMIT * 12), indices = new Uint16Array(GARAGE_VISUAL_MARK_LIMIT * 6);
  for (let slot = 0; slot < GARAGE_VISUAL_MARK_LIMIT; slot++) {
    const v = slot * 4;
    indices.set([v, v + 2, v + 1, v + 2, v + 3, v + 1], slot * 6);
    for (let corner = 0; corner < 4; corner++) normals[(v + corner) * 3 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions); geometry.setAttribute('color', colors); geometry.setAttribute('uv', uvs);
  geometry.setAttribute('garageMarkBorn', born);
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3)); geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const texture = rubberTexture();
  const material = new THREE.MeshStandardMaterial({ color: '#111720', roughness: 1, metalness: 0,
    alphaMap: texture, vertexColors: true, transparent: true, opacity: .9, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const markTime = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.garageMarkNow = markTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float garageMarkNow;\nattribute float garageMarkBorn;\nvarying float vGarageMarkAge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGarageMarkAge = max(0.0, garageMarkNow - garageMarkBorn);');
    // Fade to transparent before the server removes its 90-second mark history.
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGarageMarkAge;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(75.0, 90.0, vGarageMarkAge);');
  };
  material.customProgramCacheKey = () => 'garage-rubber-age-v1';
  const marksMesh = new THREE.Mesh(geometry, material);
  marksMesh.name = 'garage-tire-marks'; marksMesh.frustumCulled = false; marksMesh.receiveShadow = true; marksMesh.renderOrder = 1;
  room.add(marksMesh);
  const marks: (GarageTireMark | undefined)[] = new Array(GARAGE_VISUAL_MARK_LIMIT), slots = new Map<number, number>();
  const rigs = new Map<string, Rig>(), states = new Map<string, GarageDriveCar>();
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), dust = new THREE.Color('#53514b');
  let count = 0, next = 0, dirty = false, disposed = false, elapsed = 0, timeOrigin: number | undefined;

  function writeMark(mark: GarageTireMark, slot: number) {
    timeOrigin ??= mark.createdAt;
    const dx = mark.x2 - mark.x1, dz = mark.z2 - mark.z1, length = Math.hypot(dx, dz);
    const half = clamp(mark.width, .015, .22) / 2, nx = -dz / length * half, nz = dx / length * half;
    // Adjacent server segments share endpoints. No local trail interpolation across teleports.
    positions.setXYZ(slot * 4, mark.x1 + nx, FLOOR_Y, mark.z1 + nz);
    positions.setXYZ(slot * 4 + 1, mark.x1 - nx, FLOOR_Y, mark.z1 - nz);
    positions.setXYZ(slot * 4 + 2, mark.x2 + nx, FLOOR_Y, mark.z2 + nz);
    positions.setXYZ(slot * 4 + 3, mark.x2 - nx, FLOOR_Y, mark.z2 - nz);
    for (let corner = 0; corner < 4; corner++) {
      uvs.setXY(slot * 4 + corner, corner % 2, corner < 2 ? 0 : length / .18);
      colors.setXYZW(slot * 4 + corner, 1, 1, 1, clamp(mark.opacity, 0, .8));
      born.setX(slot * 4 + corner, (mark.createdAt - timeOrigin) / 1000);
    }
    marks[slot] = { ...mark }; slots.set(mark.id, slot); dirty = true;
  }
  function appendMarks(incoming: readonly GarageTireMark[]) {
    if (disposed) return;
    for (let i = Math.max(0, incoming.length - GARAGE_VISUAL_MARK_LIMIT); i < incoming.length; i++) {
      const mark = incoming[i]; if (!validMark(mark)) continue;
      const existing = slots.get(mark.id);
      if (existing !== undefined) { if (!sameMark(marks[existing], mark)) writeMark(mark, existing); continue; }
      if (marks[next]) slots.delete(marks[next]!.id);
      writeMark(mark, next); next = (next + 1) % GARAGE_VISUAL_MARK_LIMIT; count = Math.min(count + 1, GARAGE_VISUAL_MARK_LIMIT);
    }
    geometry.setDrawRange(0, count * 6);
  }
  function replaceMarks(incoming: readonly GarageTireMark[]) {
    if (disposed) return;
    const start = Math.max(0, incoming.length - GARAGE_VISUAL_MARK_LIMIT);
    let same = incoming.length - start === count;
    for (let i = start; same && i < incoming.length; i++) {
      const slot = slots.get(incoming[i].id);
      same = slot !== undefined && sameMark(marks[slot], incoming[i]);
    }
    if (same) return;
    count = next = 0; slots.clear(); marks.fill(undefined);
    appendMarks(incoming);
  }
  function releaseRig(rig: Rig) {
    for (const wheel of rig.wheels) {
      wheel.node.quaternion.copy(wheel.rotation); wheel.steering.quaternion.copy(wheel.steeringRotation);
      wheel.steering.position.copy(wheel.steeringPosition);
    }
    for (const child of rig.children) { rig.vehicle.add(child); child.position.y += rig.pivotY; }
    rig.body.removeFromParent();
    for (const entry of rig.materials) entry.mesh.material = entry.original;
    for (const paint of [...rig.paints, ...rig.glows]) paint.material.dispose();
  }
  function rigFor(id: string): Rig | undefined {
    const root = cars.get(id), old = rigs.get(id);
    if (old?.root === root) return old;
    if (old) { releaseRig(old); rigs.delete(id); }
    if (!root) return;
    let vehicle: THREE.Object3D | undefined;
    root.traverse(node => { if (node.userData.role === 'vehicle' && node.userData.front === '+Z') vehicle = node; });
    if (!vehicle) return;
    const wheels: Wheel[] = [];
    vehicle.traverse(node => {
      const steering = node.parent, radius = Number(node.userData.radius);
      if (node.userData.role !== 'wheel' || steering?.userData.role !== 'steering' || !Number.isFinite(radius) || radius <= 0) return;
      wheels.push({ node, steering, rotation: node.quaternion.clone(), steeringRotation: steering.quaternion.clone(),
        steeringPosition: steering.position.clone(), radius, front: steering.userData.axle === 'front', phase: 0 });
    });
    if (wheels.length !== 4) return;
    const pivotY = wheels.reduce((sum, wheel) => sum + wheel.steering.position.y, 0) / wheels.length;
    const wheelbase = Math.abs(wheels.find(wheel => wheel.front)!.steering.position.z - wheels.find(wheel => !wheel.front)!.steering.position.z);
    const body = new THREE.Group(); body.name = 'garage-driving-body'; body.position.y = pivotY;
    // Keep wheels, suspension and the ground-level boarding waypoint outside body suspension motion.
    const children = vehicle.children.filter(child => child.userData.role !== 'steering' && child.userData.role !== 'entry_socket' && !child.name.startsWith('wishbone'));
    vehicle.add(body);
    for (const child of children) { body.add(child); child.position.y -= pivotY; }
    const paints: Paint[] = [], glows: Paint[] = [], materials: Rig['materials'] = [], clones = new Map<THREE.Material, THREE.Material>();
    const hoverGlow = (mat: THREE.Material) => id === 'delorean' && mat.name === 'Time circuit blue';
    body.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const original = node.material as THREE.Material | THREE.Material[];
      const source = Array.isArray(original) ? original : [original];
      if (!source.some(mat => mat instanceof THREE.MeshStandardMaterial && (PAINT_NAMES.has(mat.name) || hoverGlow(mat)))) return;
      const changed = source.map(mat => {
        if (!(mat instanceof THREE.MeshStandardMaterial) || !(PAINT_NAMES.has(mat.name) || hoverGlow(mat))) return mat;
        let clone = clones.get(mat);
        if (!clone) {
          clone = mat.clone(); clones.set(mat, clone);
          (hoverGlow(mat) ? glows : paints).push({ original: mat, material: clone as THREE.MeshStandardMaterial });
        }
        return clone;
      });
      materials.push({ mesh: node, original }); node.material = Array.isArray(original) ? changed : changed[0];
    });
    const rig: Rig = { root, vehicle, body, children, wheels, paints, glows, materials, wheelbase, pivotY, steer: 0, impact: 0, damage: 0, forward: 0 };
    rigs.set(id, rig); return rig;
  }
  function poseCar(state: GarageDriveCar) { if (!disposed) states.set(state.id, { ...state }); }

  return {
    appendMarks, replaceMarks, poseCar,
    poseCars(nextStates: readonly GarageDriveCar[]) { states.clear(); for (const state of nextStates) poseCar(state); },
    get markCount() { return count; },
    update(dt: number, { visible = true, reducedMotion = false, now }: { visible?: boolean; reducedMotion?: boolean; now?: number } = {}) {
      if (disposed) return;
      marksMesh.visible = visible;
      if (!visible) return;
      if (dirty) { positions.needsUpdate = colors.needsUpdate = uvs.needsUpdate = born.needsUpdate = true; dirty = false; }
      if (timeOrigin !== undefined && now !== undefined && Number.isFinite(now)) markTime.value = (now - timeOrigin) / 1000;
      const step = clamp(finite(dt), 0, .1), damping = 1 - Math.exp(-12 * step);
      elapsed += step;
      for (const [id] of cars) {
        const rig = rigFor(id); if (!rig) continue;
        const state = states.get(id), moving = state && state.mode !== 'parked';
        // Height is authoritative and already interpolated by the caller. This
        // pose follows it directly; no separate lift clock can leave pods folded
        // after landing or late-joining a flying car.
        const hover = id === 'delorean' && moving
          ? THREE.MathUtils.smoothstep(finite(state.hoverHeight ?? 0), 0, DELOREAN_HOVER_HEIGHT) : 0;
        const yaw = finite(state?.yaw ?? 0), vx = finite(state?.vx ?? 0), vz = finite(state?.vz ?? 0);
        const forward = moving ? clamp(vx * Math.sin(yaw) + vz * Math.cos(yaw), -12, 12) : 0;
        const steer = moving ? clamp(finite(state.steer), -.85, .85) : 0;
        const damage = clamp(finite(state?.damage ?? 0), 0, 1);
        if (rig.state && damage > rig.damage) rig.impact = Math.min(.015, rig.impact + (damage - rig.damage) * .08);
        rig.damage = damage; rig.state = state;
        rig.steer += (steer - rig.steer) * damping;
        if (id === 'delorean' && !moving) rig.steer = 0;
        for (const wheel of rig.wheels) {
          // Authored tire cylinders are rotated -90° about Z: their spin axis is local +X.
          // Inner/outer front angles use the actual wheelbase and authored lateral contact locations.
          const radius = Math.abs(Math.tan(rig.steer)) > .00001 ? rig.wheelbase / Math.tan(rig.steer) : Infinity;
          const wheelSteer = wheel.front ? clamp(Math.atan(rig.wheelbase / (radius - wheel.steeringPosition.x)), -MAX_STEER, MAX_STEER) * (1 - hover) : 0;
          wheel.steering.quaternion.copy(wheel.steeringRotation).multiply(rotation.setFromAxisAngle(Y_AXIS, wheelSteer));
          if (id === 'delorean') {
            const side = Math.sign(wheel.steeringPosition.x);
            // Outer rim faces finish downwards. Lowering the articulated axle
            // clears the .19-high underside; the wheel meshes keep their own
            // authored orientation and their independent rolling transform.
            wheel.steering.quaternion.multiply(rotation.setFromAxisAngle(Z_AXIS, -side * Math.PI / 2 * hover));
            wheel.steering.position.copy(wheel.steeringPosition);
            wheel.steering.position.x += side * wheel.radius * .3 * hover;
            wheel.steering.position.y -= wheel.radius * .78 * hover;
            if (!moving) wheel.phase = 0;
          }
          if (!reducedMotion) {
            wheel.node.getWorldScale(scale);
            const physicalRadius = wheel.radius * Math.max(.01, Math.abs(scale.y));
            const rollingSpeed = wheel.front ? vx * Math.sin(yaw + wheelSteer) + vz * Math.cos(yaw + wheelSteer) : forward;
            wheel.phase = (wheel.phase + (moving ? rollingSpeed : 0) * (1 - hover) * step / physicalRadius) % (Math.PI * 2);
          }
          wheel.node.quaternion.copy(wheel.rotation).multiply(rotation.setFromAxisAngle(X_AXIS, wheel.phase));
        }
        const acceleration = step > 0 ? clamp((forward - rig.forward) / step, -10, 10) : 0;
        const lateral = moving ? clamp(finite(state.slip), -1, 1) * Math.abs(forward) : 0;
        const rollLimit = MAX_ROLL + hover * .012;
        const roadRoll = rig.steer * forward * forward * .0012 + lateral * .006;
        const airRoll = rig.steer * Math.abs(forward) * .008 + Math.sin(elapsed * .8) * .006;
        const roll = clamp(roadRoll * (1 - hover) + airRoll * hover, -rollLimit, rollLimit);
        const pitch = clamp(-acceleration * .0014 + rig.impact, -MAX_PITCH, MAX_PITCH);
        rig.body.rotation.z = reducedMotion ? 0 : clamp(rig.body.rotation.z + (roll - rig.body.rotation.z) * damping, -rollLimit, rollLimit);
        rig.body.rotation.x = reducedMotion ? 0 : clamp(rig.body.rotation.x + (pitch - rig.body.rotation.x) * damping, -MAX_PITCH, MAX_PITCH);
        rig.body.position.y = rig.pivotY + (reducedMotion ? 0 : Math.sin(elapsed * 1.8) * .012 * hover);
        rig.impact = reducedMotion ? 0 : rig.impact * Math.exp(-10 * step); rig.forward = forward;
        for (const paint of rig.paints) {
          paint.material.color.copy(paint.original.color).lerp(dust, damage * .3);
          paint.material.roughness = Math.min(1, paint.original.roughness + damage * .25);
        }
        for (const glow of rig.glows) glow.material.emissiveIntensity = glow.original.emissiveIntensity + hover * .75;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const rig of rigs.values()) releaseRig(rig);
      rigs.clear(); states.clear(); slots.clear(); marksMesh.removeFromParent();
      geometry.dispose(); material.dispose(); texture.dispose();
    },
  };
}
