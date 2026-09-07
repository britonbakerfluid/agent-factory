import { describe, expect, it } from 'vitest';
import { AvatarWalkCycle } from '../client/prototypes/factory25dAvatarGait';

describe('distance-driven avatar footsteps', () => {
  it('has the same stride at 30 and 120 fps, and advances with distance rather than elapsed time', () => {
    const travel = (fps: number, speed: number) => {
      const gait = new AvatarWalkCycle(); let frame = 0;
      for (let i = 0; i <= fps; i++) frame = gait.sample({ x: speed * i / fps, z: 0 }, i / fps, true);
      return frame;
    };
    expect(travel(30, .72)).toBe(3);
    expect(travel(120, .72)).toBe(3);
    expect(travel(60, .28)).toBe(1);
  });

  it('plants the feet when stopped or blocked, without resetting another actor or joining a global clock', () => {
    const a = new AvatarWalkCycle(), b = new AvatarWalkCycle();
    a.sample({ x: 0, z: 0 }, 0, true); b.sample({ x: 0, z: 0 }, 0, true);
    expect(a.sample({ x: .35, z: 0 }, .2, true)).toBe(1);
    expect(b.sample({ x: .05, z: 0 }, .2, true)).toBe(0);
    expect(a.sample({ x: .35, z: 0 }, .3, true)).toBe(1);
    expect(a.sample({ x: .35, z: 0 }, .4, false)).toBe(0);
    expect(a.sample({ x: .36, z: 0 }, .5, true)).toBe(0);
    expect(a.sample({ x: .65, z: 0 }, .6, true)).toBe(1);
    expect(b.sample({ x: .05, z: 0 }, .4, false)).toBe(0);
  });

  it('holds the exact pose through a packet gap without losing stride progress or walking in place', () => {
    const gait = new AvatarWalkCycle();
    gait.sample({ x: 0, z: 0 }, 0, true);
    expect(gait.sample({ x: .43, z: 0 }, .2, true)).toBe(2);
    for (const at of [.2, .22, .26, .3]) expect(gait.sample({ x: .43, z: 0 }, at, true)).toBe(2);
    expect(gait.sample({ x: .58, z: 0 }, .4, true)).toBe(2);
    expect(gait.sample({ x: .61, z: 0 }, .5, true)).toBe(3);
  });

  it('gives companions the same stride relative to their own size and follows curved travel', () => {
    const full = new AvatarWalkCycle(), child = new AvatarWalkCycle();
    for (const [i, point] of [{ x: 0, z: 0 }, { x: .15, z: 0 }, { x: .15, z: .15 }, { x: 0, z: .15 }].entries()) {
      const frame = full.sample(point, i * .1, true);
      expect(child.sample({ x: point.x * .58, z: point.z * .58 }, i * .1, true, false, .58)).toBe(frame);
    }
    expect(full.sample({ x: 0, z: .15 }, .4, true)).toBe(2);
  });

  it('does not count a floor transfer, tab resume or reduced-motion movement as a stride', () => {
    const gait = new AvatarWalkCycle();
    gait.sample({ x: 0, z: 0 }, 0, true);
    expect(gait.sample({ x: .35, z: 0 }, .2, true)).toBe(1);
    expect(gait.sample({ x: -10.5, z: 21 }, .21, true)).toBe(0);
    expect(gait.sample({ x: -10.5, z: 21.35 }, 4, true)).toBe(0);
    expect(gait.sample({ x: -10.5, z: 21.7 }, 4.2, true, true)).toBe(0);
    expect(gait.sample({ x: -10.5, z: 21.71 }, 4.3, true)).toBe(0);
  });
});
