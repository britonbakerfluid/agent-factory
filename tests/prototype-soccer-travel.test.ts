import { expect, it } from 'vitest';
import { SoccerTravel } from '../client/prototypes/factory25dSoccerTravel';
import { FACTORY_WINDOW_FRONT_Z } from '../shared/factory25d-layout';

it('flicks in the release direction, limits extreme input, and eventually settles', () => {
  const ball = new SoccerTravel(2.8, 9.07); ball.release(10000, 0);
  expect(ball.vx).toBe(8); ball.update(.1, true); expect(ball.x).toBeGreaterThan(2.8);
  for (let i = 0; i < 1000; i++) ball.update(1 / 60, i < 30);
  expect(ball.moving).toBe(false); expect(ball.x).toBeLessThanOrEqual(7.72);
  ball.release(NaN, 9); expect(ball.moving).toBe(false);
  ball.release(4, 4, true); expect(Math.hypot(ball.vx, ball.vz)).toBeCloseTo(3);
});

it('drops quietly after a slow release and reflects a fast kick at the room wall', () => {
  const ball = new SoccerTravel(7.7, 3); ball.release(.1, .1);
  expect(ball.moving).toBe(false);
  ball.release(8, 0); ball.update(.05, true);
  expect(ball.vx).toBeLessThan(0); expect(ball.x).toBeLessThan(7.72);
});

it('does not tunnel through the lounge divider and keeps placements in front of the window', () => {
  const ball = new SoccerTravel(.4, 12); ball.release(-8, 0);
  ball.update(.25, true);
  expect(ball.x).toBeGreaterThan(0); expect(ball.vx).toBeGreaterThan(0);
  ball.place(0, -100); expect(ball.z).toBeGreaterThanOrEqual(FACTORY_WINDOW_FRONT_Z + .18);
});

it('has the same free roll at 30, 60 and 120 fps and ignores invalid frames', () => {
  const results = [30, 60, 120].map(fps => { const ball = new SoccerTravel(2, 2); ball.release(1, .2); for (let i=0; i<fps; i++) ball.update(1/fps, false); return ball; });
  for (const ball of results) { expect(ball.x).toBeCloseTo(results[0].x, 10); expect(ball.z).toBeCloseTo(results[0].z, 10); }
  const ball = results[0], x = ball.x; for (const dt of [NaN, Infinity, -1, 0]) ball.update(dt, false);
  expect(ball.x).toBe(x);
});
