import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { DuckRound, DUCKS_PER_ROUND, DUCK_WAVES, SHOTS_PER_WAVE, WAVE_PAUSE_SECONDS, duckDifficulty, duckQuota } from "../client/prototypes/factory25dDuckHunt";
import { describeDuckHud } from "../client/prototypes/factory25dDuckHud";
import { crossedBasket } from "../client/prototypes/factory25dBasketball";

/** Finish the current wave and wait out the intermission. */
function settle(game: DuckRound) {
  game.closeWave();
  for (let i = 0; i < 20 && game.phase === 'between'; i++) game.tick(0.1);
}

describe("duck hunt round", () => {
  it("counts each duck once per wave and spends one shell per shot", () => {
    const game = new DuckRound();
    game.start();
    expect(game.phase).toBe('wave');
    expect(game.shots).toBe(SHOTS_PER_WAVE);
    expect(game.shoot(0)).toBe(true);
    expect(game.shoot(0)).toBe(false);
    expect(game.shoot(null)).toBe(false);
    expect(game.shots).toBe(0);
    // Out of shells: the second duck escapes and no further shot is accepted.
    expect(game.escaping).toBe(true);
    expect(game.shoot(1)).toBe(false);
    expect(game.hits).toBe(1);
    expect(game.tally.slice(0, 2)).toEqual(['hit', 'pending']);
  });
  it("plays five waves of two ducks with an automatic reload between waves", () => {
    const game = new DuckRound();
    game.start();
    for (let wave = 1; wave <= DUCK_WAVES; wave++) {
      expect(game.wave).toBe(wave);
      expect(game.shots).toBe(SHOTS_PER_WAVE);
      game.shoot(0); game.shoot(null); game.shoot(1);
      expect(game.shots).toBe(0);
      game.closeWave();
      if (wave < DUCK_WAVES) {
        expect(game.phase).toBe('between');
        // Steps are clamped to 100 ms, like frames; the pause lasts under a second.
        for (let t = 0; t < WAVE_PAUSE_SECONDS / 2; t += 0.1) game.tick(0.1);
        expect(game.phase).toBe('between');
        for (let t = 0; t < WAVE_PAUSE_SECONDS; t += 0.1) game.tick(0.1);
        expect(game.phase).toBe('wave');
      }
    }
    expect(game.phase).toBe('result');
    expect(game.hits).toBe(DUCKS_PER_ROUND);
    expect(game.tally).toEqual(Array(DUCKS_PER_ROUND).fill('hit'));
    expect(game.outcome).toBe('cleared');
    expect(game.active).toBe(false);
  });
  it("states a quota, advances the round when it is met and starts over when it is not", () => {
    expect(duckQuota(1)).toBe(6); expect(duckQuota(2)).toBe(7); expect(duckQuota(4)).toBe(9); expect(duckQuota(30)).toBe(9);
    const game = new DuckRound();
    game.start();
    // Six hits from ten ducks: exactly the round-one quota.
    for (let wave = 1; wave <= DUCK_WAVES; wave++) { game.shoot(0); if (wave === 1) game.shoot(1); settle(game); }
    expect(game.hits).toBe(6); expect(game.outcome).toBe('cleared');
    expect(game.tally.filter(mark => mark === 'miss')).toHaveLength(4);
    game.continue();
    expect(game.round).toBe(2); expect(game.phase).toBe('wave'); expect(game.hits).toBe(0); expect(game.shots).toBe(SHOTS_PER_WAVE);
    // Round two needs seven; five hits fails and the next game restarts at round one.
    for (let wave = 1; wave <= DUCK_WAVES; wave++) { game.shoot(0); settle(game); }
    expect(game.outcome).toBe('failed'); expect(game.hits).toBe(5);
    game.continue();
    expect(game.round).toBe(1); expect(game.phase).toBe('wave');
  });
  it("lets the flight time run out and keeps ducks from being shot while they fly away", () => {
    const game = new DuckRound();
    game.start();
    const { flightSeconds } = game.difficulty;
    for (let t = 0; t < flightSeconds - 0.05; t += 0.1) game.tick(0.1);
    expect(game.escaping).toBe(false);
    game.tick(0.1);
    expect(game.escaping).toBe(true);
    expect(game.shoot(0)).toBe(false);
    expect(game.shots).toBe(SHOTS_PER_WAVE);
    game.closeWave();
    expect(game.results).toEqual(['miss', 'miss']);
  });
  it("gets harder each round, within playable limits", () => {
    let previous = duckDifficulty(1);
    for (let round = 2; round <= 12; round++) {
      const next = duckDifficulty(round);
      expect(next.speed).toBeGreaterThanOrEqual(previous.speed);
      expect(next.flightSeconds).toBeLessThanOrEqual(previous.flightSeconds);
      expect(next.wobble).toBeGreaterThanOrEqual(previous.wobble);
      previous = next;
    }
    expect(duckDifficulty(40).speed).toBeLessThanOrEqual(3.4);
    expect(duckDifficulty(40).flightSeconds).toBeGreaterThanOrEqual(3.2);
  });
  it("abandons a round cleanly and keeps the round number for the next attempt", () => {
    const game = new DuckRound();
    game.start(); game.shoot(0); settle(game);
    game.end();
    expect(game.active).toBe(false); expect(game.phase).toBe('idle'); expect(game.shoot(1)).toBe(false);
    expect(game.round).toBe(1);
    game.start();
    expect(game.wave).toBe(1); expect(game.hits).toBe(0); expect(game.shots).toBe(SHOTS_PER_WAVE); expect(game.tally.every(mark => mark === 'pending')).toBe(true);
  });
  it("describes the display for screen readers", () => {
    expect(describeDuckHud({ round: 2, shots: 1, tally: ['hit', 'miss', 'hit', 'pending'], quota: 7, message: 'wave 2 of 5' }))
      .toBe('Round 2. 1 of 3 shots. 2 hit, 1 flew away, need 7.');
  });
});

it("only scores a downward crossing inside the rim, including a fast frame", () => {
  const rim = new Vector3(1.3, 1.16, -6.08);
  expect(crossedBasket(rim.clone().add(new Vector3(0, 0.2, 0)), rim.clone().add(new Vector3(0, -0.3, 0)), rim)).toBe(true);
  expect(crossedBasket(rim.clone().add(new Vector3(0, -0.2, 0)), rim.clone().add(new Vector3(0, 0.3, 0)), rim)).toBe(false);
  expect(crossedBasket(rim.clone().add(new Vector3(0.25, 0.2, 0)), rim.clone().add(new Vector3(0.25, -0.2, 0)), rim)).toBe(false);
  expect(crossedBasket(rim.clone().add(new Vector3(0, 0.3, 0)), rim.clone().add(new Vector3(0, 0.1, 0)), rim)).toBe(false);
});
