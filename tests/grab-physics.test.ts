import { describe, expect, it } from 'vitest';
import {
  GRAB_LIFT_HEIGHT,
  GRAB_REST_LENGTH,
  elasticBand,
  hangPoint,
  landingPoint,
  resolveReturnTarget,
} from '../client/grab/physics';
import { GrabMotion } from '../client/grab/GrabMotion';

const BOUNDS = { minX: 18, maxX: 782, minY: 58, maxY: 462 };

function settle(motion: GrabMotion, seconds: number, dt = 1 / 60): string {
  let last = '';
  for (let t = 0; t < seconds; t += dt) last = motion.step(dt);
  return last;
}

describe('grab geometry', () => {
  it('places the floor below the pointer, band, body and lift height', () => {
    const floor = landingPoint({ x: 100, y: 100 }, -1, 1, BOUNDS);
    expect(floor).toEqual({ x: 100, y: 100 + GRAB_REST_LENGTH + 1 + GRAB_LIFT_HEIGHT });
    // A hair anchor sits higher on the body, so the body hangs lower under the same pointer.
    expect(landingPoint({ x: 100, y: 100 }, -12, 1, BOUNDS).y).toBe(floor.y + 11);
    // Half-scale avatars use half the offsets.
    expect(landingPoint({ x: 100, y: 100 }, -1, 0.5, BOUNDS).y).toBe(100 + (GRAB_REST_LENGTH + 1 + GRAB_LIFT_HEIGHT) / 2);
    expect(hangPoint(floor, 1)).toEqual({ x: 100, y: floor.y - GRAB_LIFT_HEIGHT });
  });

  it('keeps the landing spot inside the walkable room', () => {
    expect(landingPoint({ x: -50, y: 1_000 }, -1, 1, BOUNDS)).toEqual({ x: BOUNDS.minX, y: BOUNDS.maxY });
    expect(landingPoint({ x: 900, y: -100 }, -1, 1, BOUNDS)).toEqual({ x: BOUNDS.maxX, y: BOUNDS.minY });
  });

  it('walks back to the in-flight destination, else to where the avatar stood', () => {
    expect(resolveReturnTarget({ isMoving: true, targetX: 5, targetY: 6, x: 1, y: 2 })).toEqual({ x: 5, y: 6 });
    expect(resolveReturnTarget({ isMoving: false, targetX: 5, targetY: 6, x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});

describe('GrabMotion lifecycle', () => {
  it('springs the body under the pointer while held', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 300, y: 200 }, { x: 100, y: 400 });
    expect(motion.phase).toBe('held');

    expect(settle(motion, 1.5)).toBe('held');
    expect(motion.body.x).toBeCloseTo(motion.hang.x, 0);
    expect(motion.body.y).toBeCloseTo(motion.hang.y, 0);
    expect(motion.lift).toBeCloseTo(GRAB_LIFT_HEIGHT, 0);
  });

  it('follows pointer moves and drops onto the floor derived from the release pointer', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 300, y: 200 }, { x: 300, y: 233 });
    settle(motion, 1);
    motion.setPointer({ x: 400, y: 150 });
    settle(motion, 1);
    expect(motion.body.x).toBeCloseTo(400, 0);

    motion.release({ x: 420, y: 160 });
    expect(motion.phase).toBe('falling');
    const expectedFloor = landingPoint({ x: 420, y: 160 }, -1, 1, BOUNDS);
    expect(motion.floor).toEqual(expectedFloor);

    const events: string[] = [];
    for (let i = 0; i < 120; i++) {
      const result = motion.step(1 / 60);
      events.push(result);
      if (result === 'landed') break;
    }
    expect(events.filter(e => e === 'landed')).toHaveLength(1);
    expect(events.some(e => e === 'falling')).toBe(true);
    expect(motion.body).toMatchObject({ x: expectedFloor.x, y: expectedFloor.y });
    expect(motion.lift).toBe(0);
    expect(motion.phase).toBe('idle');
    expect(motion.step(1 / 60)).toBe('idle');
  });

  it('never launches upward on release and clamps the floor to the room', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 100, y: 100 }, { x: 100, y: 300 }); // body far below, spring pulls it up fast
    motion.step(1 / 60);
    motion.step(1 / 60);
    expect(motion.body.vy).toBeLessThan(0);
    motion.release({ x: 100, y: 5_000 });
    expect(motion.body.vy).toBe(0);
    expect(motion.floor.y).toBe(BOUNDS.maxY);
  });

  it('ignores releases when idle and can be cancelled instantly', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.release({ x: 0, y: 0 });
    expect(motion.phase).toBe('idle');
    motion.begin({ x: 100, y: 100 }, { x: 100, y: 100 });
    motion.cancel();
    expect(motion.phase).toBe('idle');
  });
});

describe('elastic band pixels', () => {
  it('draws a taut band as a 1px line and a relaxed band as a 2px line', () => {
    const taut = elasticBand({ x: 100, y: 100 }, { x: 100, y: 100 + GRAB_REST_LENGTH * 2 }, GRAB_REST_LENGTH);
    expect(taut.width).toBe(1);
    expect(taut.stretch).toBeCloseTo(2);
    const relaxed = elasticBand({ x: 100, y: 100 }, { x: 100, y: 100 + GRAB_REST_LENGTH }, GRAB_REST_LENGTH);
    expect(relaxed.width).toBe(2);
    expect(relaxed.stretch).toBeCloseTo(1);
  });

  it('connects the pointer to the anchor without duplicate pixels', () => {
    const band = elasticBand({ x: 10.4, y: 20.6 }, { x: 25, y: 60 }, GRAB_REST_LENGTH);
    expect(band.pixels[0]).toMatchObject({ x: 10, y: 21 });
    expect(band.pixels[band.pixels.length - 1]).toMatchObject({ x: 25, y: 60 });
    const keys = band.pixels.map(p => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // every pixel touches the previous one, so the band never breaks
    for (let i = 1; i < band.pixels.length; i++) {
      expect(Math.abs(band.pixels[i].x - band.pixels[i - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(band.pixels[i].y - band.pixels[i - 1].y)).toBeLessThanOrEqual(1);
    }
  });

  it('sags a slack band into a soft zigzag but keeps the endpoints fixed', () => {
    const slack = elasticBand({ x: 50, y: 50 }, { x: 50, y: 58 }, GRAB_REST_LENGTH);
    expect(slack.stretch).toBeLessThan(0.85);
    expect(slack.pixels[0]).toMatchObject({ x: 50, y: 50 });
    expect(slack.pixels[slack.pixels.length - 1]).toMatchObject({ x: 50, y: 58 });
    expect(slack.pixels.some(p => p.x === 51)).toBe(true);
  });
});
