import * as THREE from 'three';
import { VendingCabinetRock } from './factory25dVendingMotion';

export type FixturePoseState = 'upright' | 'tipping' | 'fallen' | 'recovering';
type FixtureRockOptions = { canFall?: boolean; fallAxis?: 'x' | 'z'; onFallen?: () => void };

/** Move a complete fixture as a rigid body while its switch and animation keep working. */
export function createFixtureRock(objects: THREE.Object3D[], options: FixtureRockOptions = {}) {
  const parent = objects[0]?.parent;
  if (!parent || objects.some(object => object.parent !== parent)) return;
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert(), bounds = new THREE.Box3();
  for (const object of objects) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) bounds.union(box.applyMatrix4(inverse));
  }
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const origin = new THREE.Vector3(center.x, bounds.min.y, center.z);
  const pivot = new THREE.Group(); pivot.name = 'light-fixture-rock'; pivot.position.copy(origin); parent.add(pivot);
  for (const object of objects) pivot.attach(object);
  // Test the actual pieces against their support surface while falling, instead
  // of lowering the shade through the floor or stretching the stem.
  pivot.updateWorldMatrix(true, true);
  const contactPoints: THREE.Vector3[] = [], local = pivot.matrixWorld.clone().invert();
  for (const object of objects) object.traverse(part => {
    if (!(part instanceof THREE.Mesh)) return;
    part.geometry.computeBoundingBox(); const box = part.geometry.boundingBox;
    if (!box) return;
    const transform = local.clone().multiply(part.matrixWorld);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      contactPoints.push(new THREE.Vector3(x, y, z).applyMatrix4(transform));
    }
  });
  // A compact support footprint gives small fixtures a readable, brief response.
  const rock = new VendingCabinetRock(Math.max(.015, size.z / 2), Math.max(.45, size.y / 2));
  const axis = options.fallAxis ?? 'x';
  let state: FixturePoseState = 'upright', angle = 0, speed = 0, recoveryStart = 0, recovery = 0;
  let taps = 0, quiet = 2, bounced = false, disposed = false;
  function settle() { state = 'fallen'; angle = -Math.PI / 2; speed = 0; options.onFallen?.(); }
  function setFallPose(lift = 0) {
    pivot.rotation.set(0, 0, 0); pivot.rotation[axis] = angle;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    let lowest = Infinity;
    for (const point of contactPoints) lowest = Math.min(lowest, axis === 'x' ? point.y * cos - point.z * sin : point.x * sin + point.y * cos);
    pivot.position.set(origin.x, origin.y - (Number.isFinite(lowest) ? lowest : 0) + lift, origin.z);
  }
  return {
    get state() { return state; },
    get isPending() { return !disposed && (state === 'fallen' || state === 'tipping'); },
    worldAnchor(target: THREE.Vector3) { return parent.localToWorld(target.copy(origin)); },
    press() {
      if (disposed || state === 'fallen' || state === 'tipping') return;
      if (state === 'upright') rock.press();
      if (!options.canFall) return;
      taps = quiet > 1.2 ? 1 : taps + 1; quiet = 0;
      if (taps < 4) return;
      if (state === 'upright') angle = axis === 'x' ? rock.angle : 0;
      state = 'tipping'; speed = -1.5; bounced = false; taps = 0;
    },
    recover() {
      if (disposed || state !== 'fallen') return;
      recoveryStart = angle; recovery = 0; taps = 0; quiet = 2;
      state = 'recovering';
    },
    update(dt: number, reduced: boolean) {
      if (disposed) return;
      dt = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
      quiet += dt;
      if (state === 'upright') {
        const pose = rock.update(dt, reduced);
        pivot.rotation.set(pose.pitch, 0, 0);
        pivot.position.set(origin.x, origin.y + pose.y, origin.z + pose.z);
        return;
      }
      rock.update(0, true); // No hidden spring energy replays after the clerk restores it.
      if (state === 'tipping') {
        if (reduced) settle();
        else {
          const steps = Math.ceil(dt * 240), step = steps ? dt / steps : 0;
          for (let i = 0; i < steps && state === 'tipping'; i++) {
            speed -= (3.4 + Math.abs(Math.sin(angle)) * 7.6) * step;
            angle += speed * step;
            if (angle <= -Math.PI / 2) {
              angle = -Math.PI / 2;
              if (!bounced) { bounced = true; speed = -speed * .13; }
              else settle();
            }
          }
        }
      } else if (state === 'recovering') {
        recovery = reduced ? 1 : Math.min(1, recovery + dt / .72);
        const eased = recovery * recovery * (3 - 2 * recovery);
        angle = recoveryStart * (1 - eased);
        if (recovery >= 1) {
          state = 'upright'; angle = 0;
          pivot.rotation.set(0, 0, 0); pivot.position.copy(origin); return;
        }
        setFallPose(Math.sin(recovery * Math.PI) * Math.min(.055, size.y * .08)); return;
      }
      setFallPose();
    },
    dispose() {
      disposed = true;
      pivot.rotation.set(0, 0, 0); pivot.position.copy(origin); pivot.updateWorldMatrix(true, true);
      for (const object of objects) parent.attach(object);
      pivot.removeFromParent();
    },
  };
}
