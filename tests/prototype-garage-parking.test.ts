import { describe, expect, it } from 'vitest';
import { planGarageParking, type GarageParkingPose as Pose } from '../shared/factory25d-parking';
import { GarageDrivingSimulation } from '../shared/factory25d-driving';
import { GARAGE_CAR_BAYS, GARAGE_CAR_YAW, type GarageCarId } from '../shared/factory25d-garage';

const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
function expectGroundPath(path: Pose[] | undefined, start: Pose, goal: Pose, clear: (pose: Pose) => boolean) {
  expect(path).toBeDefined(); expect(path![0]).toEqual(start); expect(path!.at(-1)).toEqual(goal);
  for (let i = 1; i < path!.length; i++) {
    const a = path![i - 1], b = path![i], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), turn = angle(b.yaw - a.yaw), middle = a.yaw + turn / 2;
    expect(clear(b)).toBe(true); expect(d).toBeLessThanOrEqual(.14001);
    expect(Math.abs(turn)).toBeLessThanOrEqual(d / 2.29 + 1e-7); // No rotation in place, including gear changes.
    expect(Math.abs(dx * Math.cos(middle) - dz * Math.sin(middle))).toBeLessThan(1e-5); // Tangent motion, not lateral sliding.
    // Independently check between returned samples as the follower interpolates.
    for (const t of [.25, .5, .75]) expect(clear({ x: a.x + dx * t, z: a.z + dz * t, yaw: a.yaw + turn * t })).toBe(true);
  }
}

describe('fresh collision-aware self parking', () => {
  it.each([1, -1])('uses a direct straight route in gear %s, without a needless turnaround', gear => {
    const start = { x: 0, z: 6, yaw: 0 }, goal = { x: 0, z: 6 + gear * 3, yaw: 0 }; let checks = 0;
    const path = planGarageParking(start, goal, () => { checks++; return true; });
    expectGroundPath(path, start, goal, () => true);
    expect(path!.every(pose => Math.abs(pose.x) < 1e-7 && Math.abs(pose.yaw) < 1e-7)).toBe(true);
    expect(checks).toBeLessThan(250);
  });

  it('turns around an intervening obstacle while approaching the exact final heading', () => {
    const start = { x: 0, z: 1, yaw: 0 }, goal = { x: 0, z: 9, yaw: 0 };
    const clear = (p: Pose) => !(p.x > -1.25 && p.x < 1.25 && p.z > 3 && p.z < 7);
    const path = planGarageParking(start, goal, clear);
    expectGroundPath(path, start, goal, clear); expect(path!.some(pose => Math.abs(pose.x) > 1.25)).toBe(true);
  });

  it('keeps an arbitrary-heading straight approach short instead of rounding a tiny turn into a full circle', () => {
    const start = { x: 0, z: 6, yaw: 2.621592653589793 }, goal = { x: Math.sin(start.yaw) * 3, z: start.z + Math.cos(start.yaw) * 3, yaw: start.yaw };
    const path = planGarageParking(start, goal, () => true);
    expectGroundPath(path, start, goal, () => true);
    expect(path!.length).toBeLessThan(25);
  });

  it.each([
    ['porsche', { x: -5, z: 7, yaw: Math.PI / 2 }],
    ['mini', { x: 0, z: 8, yaw: 0 }],
    ['delorean', { x: 5, z: 8, yaw: -Math.PI / 2 }],
    ['f1', { x: 6, z: 7, yaw: Math.PI }],
    ['mini', { x: -.6565144741, z: 1.9683305592, yaw: 1.8631000478 }],
  ] as Array<[GarageCarId, Pose]>)('parks %s around the current full furniture and the other three cars', (id, start) => {
    const simulation = new GarageDrivingSimulation(), goal = { ...GARAGE_CAR_BAYS[id], yaw: GARAGE_CAR_YAW }, car = simulation.car(id);
    const clear = (pose: Pose) => simulation.isClear({ ...car, ...pose }); let checks = 0;
    const path = planGarageParking(start, goal, pose => { checks++; return clear(pose); });
    expectGroundPath(path, start, goal, clear); expect(checks).toBeLessThanOrEqual(24_000);
  });

  it('checks swept poses along edges and returns undefined under a bounded search when a wall cuts the room in two', () => {
    const start = { x: 0, z: 0, yaw: 0 }, goal = { x: 0, z: 10, yaw: 0 }; let checks = 0;
    const clear = (pose: Pose) => { checks++; return pose.z < 4 || pose.z > 4.25; };
    expect(planGarageParking(start, goal, clear)).toBeUndefined(); expect(checks).toBeLessThanOrEqual(24_000);
  });

  it('rejects an occupied goal or nonfinite input without moving the inputs', () => {
    const start = { x: 0, z: 5, yaw: .2 }, goal = { x: 0, z: 0, yaw: 2.6 }, original = structuredClone([start, goal]); let checks = 0;
    expect(planGarageParking(start, goal, pose => { checks++; return pose.z > 1; })).toBeUndefined();
    expect(checks).toBe(2); expect([start, goal]).toEqual(original);
    expect(planGarageParking({ ...start, x: NaN }, goal, () => true)).toBeUndefined();
  });

  it('permits a flying car to turn in a tight clear space while a ground car cannot rotate there', () => {
    const start = { x: 0, z: 5, yaw: 0 }, goal = { ...start, yaw: Math.PI };
    const clear = (pose: Pose) => Math.hypot(pose.x, pose.z - 5) < .2;
    expect(planGarageParking(start, goal, clear)).toBeUndefined();
    const flight = planGarageParking(start, goal, clear, { flying: true });
    expect(flight![0]).toEqual(start); expect(flight!.at(-1)).toEqual(goal);
    expect(flight!.every(clear)).toBe(true);
  });
});
