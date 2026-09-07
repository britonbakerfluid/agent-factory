import * as THREE from 'three';

export const VENDING_CAN_RADIUS = .035;
export const VENDING_CAN_HALF_SEGMENT = .035;
export const VENDING_PILE_LIMIT = 48;
export const VENDING_PHYSICS_STEP = 1 / 120;
const REACH = VENDING_CAN_RADIUS + VENDING_CAN_HALF_SEGMENT;
const INVERSE_INERTIA = 1 / ((3 * VENDING_CAN_RADIUS ** 2 + (REACH * 2) ** 2) / 12);
const UP = new THREE.Vector3(0, 1, 0);

/** A capsule around a short can, with linear and angular momentum. Coordinates
 * belong to the machine: +Z points out of its pickup tray and Y=0 is the floor. */
export interface VendingCanBody {
  id: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  sleeping: boolean;
  quietTime: number;
  supported: boolean;
}

/** Closest points on finite capsule axes, including parallel/degenerate axes. */
function closestSegments(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3,
  q2: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3) {
  const dx = q1.x - p1.x, dy = q1.y - p1.y, dz = q1.z - p1.z;
  const ex = q2.x - p2.x, ey = q2.y - p2.y, ez = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = dx * dx + dy * dy + dz * dz, e = ex * ex + ey * ey + ez * ez;
  const b = dx * ex + dy * ey + dz * ez, c = dx * rx + dy * ry + dz * rz;
  const f = ex * rx + ey * ry + ez * rz, denominator = a * e - b * b;
  // Parallel side contacts use the shared middle instead of an arbitrary end;
  // otherwise two level cans manufacture opposite spins in a head-on collision.
  let s = denominator > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1) : .5;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
  else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  c1.set(p1.x + dx * s, p1.y + dy * s, p1.z + dz * s);
  c2.set(p2.x + ex * t, p2.y + ey * t, p2.z + ez * t);
}

const measureAxis = new THREE.Vector3(), measureA = new THREE.Vector3(), measureB = new THREE.Vector3();
const measureC = new THREE.Vector3(), measureD = new THREE.Vector3(), measureP = new THREE.Vector3(), measureQ = new THREE.Vector3();
export function canEndpoints(body: VendingCanBody, a: THREE.Vector3, b: THREE.Vector3) {
  measureAxis.copy(UP).applyQuaternion(body.quaternion).multiplyScalar(VENDING_CAN_HALF_SEGMENT);
  a.copy(body.position).sub(measureAxis); b.copy(body.position).add(measureAxis);
}
export function canSeparation(a: VendingCanBody, b: VendingCanBody) {
  canEndpoints(a, measureA, measureB); canEndpoints(b, measureC, measureD);
  closestSegments(measureA, measureB, measureC, measureD, measureP, measureQ);
  return measureP.distanceTo(measureQ) - VENDING_CAN_RADIUS * 2;
}

/** Small fixed-step rigid-body solver. Sleeping pairs do no work; 48 bodies cap
 * the worst case. No per-frame geometry, broad-phase allocations, or dependency. */
export class VendingPilePhysics {
  readonly bodies: VendingCanBody[] = [];
  queued = 0;
  private accumulator = 0;
  private dispenseWait = 0;
  private serial = 0;
  private a0 = new THREE.Vector3(); private a1 = new THREE.Vector3();
  private b0 = new THREE.Vector3(); private b1 = new THREE.Vector3();
  private ca = new THREE.Vector3(); private cb = new THREE.Vector3();
  private normal = new THREE.Vector3(); private point = new THREE.Vector3();
  private ra = new THREE.Vector3(); private rb = new THREE.Vector3();
  private relative = new THREE.Vector3(); private scratch = new THREE.Vector3();
  private tangent = new THREE.Vector3(); private impulse = new THREE.Vector3();
  private spin = new THREE.Quaternion();

  dispense() {
    if (this.bodies.length + this.queued >= VENDING_PILE_LIMIT) return false;
    this.queued++;
    return true;
  }

  /** Transfer exactly one floor object to a carrier and let its former supports settle. */
  take(id: number): VendingCanBody | undefined {
    const index = this.bodies.findIndex(body => body.id === id);
    if (index < 0) return;
    const [taken] = this.bodies.splice(index, 1);
    // A supported stack may extend beyond the removed body's immediate neighbors.
    for (const body of this.bodies) this.wake(body);
    return taken;
  }

  private spawn() {
    const id = this.serial++;
    const variation = Math.sin(id * 2.3999632297);
    this.bodies.push({ id,
      position: new THREE.Vector3(-.047 + variation * .055, .315, .47),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(.55, id * .7, variation * .6)),
      velocity: new THREE.Vector3(variation * .075, .025, .19 + (variation + 1) * .035),
      angularVelocity: new THREE.Vector3(4.5, variation * 1.5, variation * 2),
      sleeping: false, quietTime: 0, supported: false,
    });
    this.queued--; this.dispenseWait = .22;
  }

  update(deltaSeconds: number) {
    // A suspended tab never catches up with a burst of falling objects.
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.accumulator += Math.min(deltaSeconds, .1);
    let steps = 0;
    while (this.accumulator + 1e-10 >= VENDING_PHYSICS_STEP && steps++ < 12) {
      this.step(VENDING_PHYSICS_STEP);
      this.accumulator -= VENDING_PHYSICS_STEP;
    }
  }

  private wake(body: VendingCanBody) { body.sleeping = false; body.quietTime = 0; }

  private contact(a: VendingCanBody, b: VendingCanBody | null, point: THREE.Vector3,
    normal: THREE.Vector3, penetration: number, restitution: number) {
    this.ra.copy(point).sub(a.position);
    this.relative.copy(a.velocity).add(this.scratch.crossVectors(a.angularVelocity, this.ra));
    if (b) {
      this.rb.copy(point).sub(b.position);
      this.relative.sub(b.velocity).sub(this.scratch.crossVectors(b.angularVelocity, this.rb));
    }
    const closing = this.relative.dot(normal);
    if (b && (penetration > .002 || Math.abs(closing) > .04)) {
      if (a.sleeping) this.wake(a);
      if (b.sleeping) this.wake(b);
    }
    const inverseA = a.sleeping ? 0 : 1, inverseB = b && !b.sleeping ? 1 : 0;
    const inverseMass = inverseA + inverseB;
    if (!inverseMass) return;
    const correction = Math.max(0, penetration - .00008) * .72 / inverseMass;
    a.position.addScaledVector(normal, correction * inverseA);
    if (b) b.position.addScaledVector(normal, -correction * inverseB);
    if (normal.y > .25) a.supported = true;
    if (b && normal.y < -.25) b.supported = true;
    if (closing >= 0) return;
    const inertiaA = this.scratch.crossVectors(this.ra, normal).lengthSq() * INVERSE_INERTIA * inverseA;
    const inertiaB = b ? this.scratch.crossVectors(this.rb, normal).lengthSq() * INVERSE_INERTIA * inverseB : 0;
    const strength = -(1 + (closing < -.28 ? restitution : 0)) * closing / (inverseMass + inertiaA + inertiaB);
    this.impulse.copy(normal).multiplyScalar(strength);
    this.applyImpulse(a, b, inverseA, inverseB);
    // Coulomb contact friction transfers a sideways hit into a spin, then slows
    // sliding at the floor. The impulse is shared equally between moving cans.
    this.tangent.copy(this.relative).addScaledVector(normal, -closing);
    const tangentSpeed = this.tangent.length();
    if (tangentSpeed < 1e-8) return;
    this.tangent.multiplyScalar(1 / tangentSpeed);
    const tangentA = this.scratch.crossVectors(this.ra, this.tangent).lengthSq() * INVERSE_INERTIA * inverseA;
    const tangentB = b ? this.scratch.crossVectors(this.rb, this.tangent).lengthSq() * INVERSE_INERTIA * inverseB : 0;
    this.impulse.copy(this.tangent).multiplyScalar(-Math.min(tangentSpeed / (inverseMass + tangentA + tangentB), strength * .64));
    this.applyImpulse(a, b, inverseA, inverseB);
  }

  private applyImpulse(a: VendingCanBody, b: VendingCanBody | null, inverseA: number, inverseB: number) {
    a.velocity.addScaledVector(this.impulse, inverseA);
    a.angularVelocity.addScaledVector(this.scratch.crossVectors(this.ra, this.impulse), INVERSE_INERTIA * inverseA);
    if (b) {
      b.velocity.addScaledVector(this.impulse, -inverseB);
      b.angularVelocity.addScaledVector(this.scratch.crossVectors(this.rb, this.impulse), -INVERSE_INERTIA * inverseB);
    }
  }

  private step(dt: number) {
    this.dispenseWait -= dt;
    if (this.queued && this.dispenseWait <= 0) {
      // Let the pickup mouth clear before feeding the next can, including when
      // a pile eventually reaches the slot. No two bodies spawn inside each other.
      this.point.set(-.047 + Math.sin(this.serial * 2.3999632297) * .055, .315, .47);
      const clear = this.bodies.every(body => body.position.distanceToSquared(this.point) > (.145 ** 2));
      if (clear) this.spawn();
    }
    if (!this.bodies.some(body => !body.sleeping)) return;
    for (const body of this.bodies) {
      if (body.sleeping) continue;
      body.supported = false;
      body.velocity.y -= 5.4 * dt;
      body.velocity.multiplyScalar(Math.exp(-.12 * dt));
      body.angularVelocity.multiplyScalar(Math.exp(-.4 * dt));
      body.position.addScaledVector(body.velocity, dt);
      const angularSpeed = body.angularVelocity.length();
      if (angularSpeed > 1e-8) {
        this.spin.setFromAxisAngle(this.scratch.copy(body.angularVelocity).multiplyScalar(1 / angularSpeed), angularSpeed * dt);
        body.quaternion.premultiply(this.spin).normalize();
      }
    }
    for (let iteration = 0; iteration < 7; iteration++) {
      for (const body of this.bodies) {
        if (body.sleeping) continue;
        for (let end = 0; end < 2; end++) {
          // Recompute after each positional correction; stale endpoints would
          // apply the same floor correction twice and keep settled cans awake.
          canEndpoints(body, this.a0, this.a1);
          const endpoint = end ? this.a1 : this.a0;
          if (endpoint.y < VENDING_CAN_RADIUS) {
            this.normal.copy(UP); this.point.copy(endpoint); this.point.y = 0;
            this.contact(body, null, this.point, this.normal, VENDING_CAN_RADIUS - endpoint.y, .19);
          }
          // The cabinet front is solid. The spawn point is outside its pickup
          // tray so floor cans cannot tunnel back into the machine.
          if (Math.abs(endpoint.x) < .48 + VENDING_CAN_RADIUS && endpoint.z < .35 + VENDING_CAN_RADIUS) {
            this.normal.set(0, 0, 1); this.point.copy(endpoint); this.point.z = .35;
            this.contact(body, null, this.point, this.normal, .35 + VENDING_CAN_RADIUS - endpoint.z, .16);
          }
        }
      }
      for (let i = 0; i < this.bodies.length; i++) for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i], b = this.bodies[j];
        if ((a.sleeping && b.sleeping) || a.position.distanceToSquared(b.position) >= (REACH * 2) ** 2) continue;
        canEndpoints(a, this.a0, this.a1); canEndpoints(b, this.b0, this.b1);
        closestSegments(this.a0, this.a1, this.b0, this.b1, this.ca, this.cb);
        this.normal.copy(this.ca).sub(this.cb);
        const distance = this.normal.length();
        if (distance >= VENDING_CAN_RADIUS * 2) continue;
        if (distance < 1e-8) this.normal.set(1, 0, 0); else this.normal.multiplyScalar(1 / distance);
        this.point.copy(this.ca).add(this.cb).multiplyScalar(.5);
        this.contact(a, b, this.point, this.normal, VENDING_CAN_RADIUS * 2 - distance, .14);
      }
    }
    for (const body of this.bodies) {
      if (body.sleeping) continue;
      if (body.supported) {
        // Slight rolling resistance prevents the small metal cans wandering
        // across the room indefinitely after their actual collision impulses.
        body.angularVelocity.multiplyScalar(Math.exp(-1.6 * dt));
        body.velocity.x *= Math.exp(-.7 * dt); body.velocity.z *= Math.exp(-.7 * dt);
      }
      const quiet = body.supported && body.velocity.lengthSq() < .0036 && body.angularVelocity.lengthSq() < .25;
      body.quietTime = quiet ? body.quietTime + dt : 0;
      if (body.quietTime > .75) {
        body.sleeping = true; body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
      }
    }
  }
}
