import { describe, it, expect } from 'vitest';
import { GarageDriveInterpolation } from '../client/prototypes/factory25dDriveInterpolation';
import { GarageDrivingSimulation } from '../shared/factory25d-driving';

describe('shared garage car rendering', () => {
  it('interpolates authoritative hover height for other viewers without overshooting the ceiling', () => {
    const car = new GarageDrivingSimulation().car('delorean'), poses = new GarageDriveInterpolation();
    poses.push([{ ...car, hoverHeight: 0 }], 1000, 0);
    poses.push([{ ...car, hoverHeight: 1.45 }], 1100, 100);
    expect(poses.sample(150)[0].hoverHeight).toBeCloseTo(.725);
    expect(poses.sample(5000)[0].hoverHeight).toBe(1.45);
  });
  it('blends packet steps without extrapolating through collisions or drifting when packets stop', () => {
    const sim = new GarageDrivingSimulation(), poses = new GarageDriveInterpolation();
    const car = sim.car('mini');
    poses.push([{ ...car, x: 0 }], 1000, 0);
    poses.push([{ ...car, x: 1 }], 1100, 100);
    expect(poses.sample(100)[0].x).toBe(0);
    expect(poses.sample(150)[0].x).toBeCloseTo(.5);
    expect(poses.sample(200)[0].x).toBe(1);
    expect(poses.sample(5000)[0].x).toBe(1);
  });
  it('turns across the yaw boundary without spinning all the way around', () => {
    const car = new GarageDrivingSimulation().car('mini'), poses = new GarageDriveInterpolation();
    poses.push([{ ...car, yaw: Math.PI - .1 }], 1000, 0);
    poses.push([{ ...car, yaw: -Math.PI + .1 }], 1100, 100);
    expect(poses.sample(150)[0].yaw).toBeCloseTo(Math.PI);
  });
  it('ignores old packets and never rewinds the render clock on uneven delivery', () => {
    const car = new GarageDrivingSimulation().car('mini'), poses = new GarageDriveInterpolation();
    poses.push([{ ...car, x: 0 }], 1000, 0);
    poses.push([{ ...car, x: 1 }], 1100, 100);
    expect(poses.sample(190)[0].x).toBeCloseTo(.9);
    poses.push([{ ...car, x: -5 }], 1050, 190);
    expect(poses.sample(195)[0].x).toBeCloseTo(.95);
    poses.push([{ ...car, x: 1.2 }], 1120, 200);
    expect(poses.sample(200)[0].x).toBeGreaterThanOrEqual(.95);
    poses.clear(); expect(poses.sample(201)).toEqual([]);
  });
  it('treats explicit recovery as a reposition, not a drive through other cars', () => {
    const car = new GarageDrivingSimulation().car('mini'), poses = new GarageDriveInterpolation();
    poses.push([{ ...car, x: -5 }], 1000, 0);
    poses.push([{ ...car, x: 5 }], 1100, 100);
    expect(poses.sample(150)[0].x).toBe(5);
  });
});
