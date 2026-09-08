import { describe, expect, it } from 'vitest';
import { SoccerJuggle } from '../client/prototypes/factory25dSoccerMotion';

function advance(ball: SoccerJuggle, seconds: number, fps = 120, reduced = false) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) ball.update(1 / fps, reduced);
}

describe('soccer juggling', () => {
  it('kicks up from the floor and redirects a falling ball without moving it to the start', () => {
    const ball = new SoccerJuggle(); ball.kick(); advance(ball, .6);
    expect(ball.height).toBeGreaterThan(.5); expect(ball.velocity).toBeLessThan(0);
    const height = ball.height, spin = ball.spin;
    ball.kick();
    expect(ball.height).toBe(height); expect(ball.spin).toBe(spin);
    expect(ball.velocity).toBeGreaterThan(0); expect(ball.touches).toBe(2);
    advance(ball, .1); expect(ball.height).toBeGreaterThan(height);
  });

  it('bounds frantic clicking and settles on the floor after the last kick', () => {
    const ball = new SoccerJuggle(); let peak = 0;
    for (let frame = 0; frame < 1800; frame++) {
      ball.kick(); ball.kick(); ball.update(1 / 120);
      peak = Math.max(peak, ball.height);
      expect(ball.height).toBeGreaterThanOrEqual(0);
      expect(ball.height).toBeLessThanOrEqual(ball.ceiling + 1e-10);
      expect(Number.isFinite(ball.spin)).toBe(true);
    }
    expect(peak).toBeGreaterThan(1);
    advance(ball, 3);
    expect(ball.airborne).toBe(false); expect(ball.height).toBe(0);
    expect(ball.velocity).toBe(0); expect(ball.angularVelocity).toBe(0);
    expect(ball.touches).toBe(0);
  });

  it('keeps the same flight, spin and bounce at 30, 60 and 120 fps', () => {
    const balls = [30, 60, 120].map(fps => {
      const ball = new SoccerJuggle(); ball.kick(); advance(ball, .4, fps);
      ball.kick(); advance(ball, 1.2, fps); return ball;
    });
    for (const ball of balls.slice(1)) {
      expect(ball.height).toBeCloseTo(balls[0].height, 10);
      expect(ball.velocity).toBeCloseTo(balls[0].velocity, 10);
      expect(ball.spin).toBeCloseTo(balls[0].spin, 10);
    }
  });

  it('keeps reduced-motion kicks playable with short flights, no spin and no extra bounce', () => {
    const ball = new SoccerJuggle(); ball.kick(true);
    advance(ball, .2, 120, true);
    expect(ball.height).toBeGreaterThan(.2); expect(ball.spin).toBe(0);
    ball.kick(true);
    for (let frame = 0; frame < 120; frame++) {
      ball.update(1 / 120, true);
      expect(ball.height).toBeLessThanOrEqual(.34 + 1e-10);
    }
    expect(ball.height).toBe(0); expect(ball.airborne).toBe(false); expect(ball.spin).toBe(0);
  });

  it('ignores invalid frame intervals and can cancel an offscreen flight without replay', () => {
    const ball = new SoccerJuggle(); ball.kick(); advance(ball, .1);
    const height = ball.height;
    for (const dt of [NaN, Infinity, -1, 0]) ball.update(dt);
    expect(ball.height).toBe(height);
    ball.reset(); advance(ball, 1);
    expect(ball.height).toBe(0); expect(ball.velocity).toBe(0); expect(ball.airborne).toBe(false);
  });
});
