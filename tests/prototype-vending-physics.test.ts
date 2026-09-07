import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { VendingPilePhysics, VENDING_CAN_RADIUS, VENDING_PHYSICS_STEP, VENDING_PILE_LIMIT,
  canEndpoints, canSeparation, type VendingCanBody } from '../client/prototypes/factory25dVendingPhysics';

const run = (pile: VendingPilePhysics, seconds: number, hz = 120) => {
  for (let frame = 0; frame < seconds * hz; frame++) pile.update(1 / hz);
};
const body = (id: number, x: number, velocityX: number): VendingCanBody => ({
  id, position: new Vector3(x, 1, 1), quaternion: new Quaternion(),
  velocity: new Vector3(velocityX, 0, 0), angularVelocity: new Vector3(),
  sleeping: false, quietTime: 0, supported: false,
});

describe('vending machine floor objects', () => {
  it('transfers an item only once and wakes objects that were resting on it', () => {
    const pile = new VendingPilePhysics();
    const lower = body(0, 0, 0), upper = body(1, 0, 0);
    lower.position.y = .07; upper.position.y = .21;
    lower.sleeping = upper.sleeping = true;
    pile.bodies.push(lower, upper);
    expect(pile.take(0)).toBe(lower); expect(pile.take(0)).toBeUndefined();
    expect(pile.bodies).toEqual([upper]); expect(upper.sleeping).toBe(false);
    run(pile, 2);
    expect(upper.position.y).toBeLessThan(.1);
  });
  it('drops a real tumbling body from the pickup tray, then sleeps it on the floor', () => {
    const pile = new VendingPilePhysics();
    expect(pile.dispense()).toBe(true); pile.update(VENDING_PHYSICS_STEP);
    const can = pile.bodies[0];
    expect(can.position.y).toBeGreaterThan(.3); expect(can.position.z).toBeGreaterThan(.4);
    const initialRotation = can.quaternion.clone();
    run(pile, .4);
    expect(can.quaternion.angleTo(initialRotation)).toBeGreaterThan(.1);
    expect(can.position.y).toBeLessThan(.1);
    run(pile, 8);
    const low = new Vector3(), high = new Vector3(); canEndpoints(can, low, high);
    expect(Math.min(low.y, high.y)).toBeGreaterThan(VENDING_CAN_RADIUS - .0005);
    expect(can.sleeping).toBe(true); expect(can.velocity.length()).toBe(0);
    const settled = can.position.clone(); run(pile, 15);
    expect(can.position.distanceTo(settled)).toBe(0);
  });

  it('shares collision impulses between cans without creating horizontal momentum or energy', () => {
    const pile = new VendingPilePhysics();
    const a = body(0, -.034, .4), b = body(1, .034, -.4);
    pile.bodies.push(a, b);
    const energyBefore = a.velocity.lengthSq() + b.velocity.lengthSq();
    pile.update(VENDING_PHYSICS_STEP);
    expect(a.velocity.x).toBeLessThan(0); expect(b.velocity.x).toBeGreaterThan(0);
    expect(a.velocity.x + b.velocity.x).toBeCloseTo(0, 10);
    expect(a.velocity.lengthSq() + b.velocity.lengthSq()).toBeLessThan(energyBefore);
    expect(a.angularVelocity.length() + b.angularVelocity.length()).toBeLessThan(.00001);
    expect(canSeparation(a, b)).toBeGreaterThan(-.0002);
  });

  it('builds a stable multi-layer pile through actual object contacts and caps rapid clicks', () => {
    const pile = new VendingPilePhysics();
    for (let click = 0; click < 500; click++) expect(pile.dispense()).toBe(click < VENDING_PILE_LIMIT);
    run(pile, 45);
    expect(pile.bodies.length).toBeGreaterThan(30);
    expect(pile.bodies.length + pile.queued).toBe(VENDING_PILE_LIMIT);
    expect(Math.max(...pile.bodies.map(can => can.position.y))).toBeGreaterThan(.12);
    expect(pile.bodies.every(can => can.sleeping)).toBe(true);
    const a = new Vector3(), b = new Vector3();
    for (let i = 0; i < pile.bodies.length; i++) {
      const can = pile.bodies[i]; canEndpoints(can, a, b);
      expect(Math.min(a.y, b.y)).toBeGreaterThan(VENDING_CAN_RADIUS - .001);
      expect(can.position.length()).toBeLessThan(2);
      for (let j = i + 1; j < pile.bodies.length; j++) expect(canSeparation(can, pile.bodies[j])).toBeGreaterThan(-.0016);
    }
  });

  it('wakes a settled can when another can physically hits it', () => {
    const pile = new VendingPilePhysics();
    const sleeper = body(0, 0, 0); sleeper.sleeping = true;
    const incoming = body(1, -.068, .5);
    pile.bodies.push(sleeper, incoming); pile.update(VENDING_PHYSICS_STEP);
    expect(sleeper.sleeping).toBe(false); expect(sleeper.velocity.x).toBeGreaterThan(0);
    expect(canSeparation(sleeper, incoming)).toBeGreaterThan(-.0003);
  });

  it('runs the same fixed simulation at phone and desktop frame rates', () => {
    const phone = new VendingPilePhysics(), desktop = new VendingPilePhysics();
    for (let i = 0; i < 12; i++) { phone.dispense(); desktop.dispense(); }
    run(phone, 10, 30); run(desktop, 10, 120);
    expect(phone.bodies.length).toBe(desktop.bodies.length);
    for (let i = 0; i < phone.bodies.length; i++) {
      expect(phone.bodies[i].position.distanceTo(desktop.bodies[i].position)).toBeLessThan(1e-8);
      expect(phone.bodies[i].quaternion.angleTo(desktop.bodies[i].quaternion)).toBeLessThan(1e-7);
    }
  });

  it('bounds suspended-tab catch-up and rejects invalid time deltas', () => {
    const pile = new VendingPilePhysics(); for (let i = 0; i < 20; i++) pile.dispense();
    pile.update(Number.NaN); pile.update(-1); pile.update(Number.POSITIVE_INFINITY);
    expect(pile.bodies).toHaveLength(0);
    pile.update(120);
    expect(pile.bodies).toHaveLength(1); expect(pile.queued).toBe(19);
    expect(pile.bodies[0].position.y).toBeGreaterThan(.2);
  });
});
