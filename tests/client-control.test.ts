import { describe, expect, it } from 'vitest';
import { isInShotCorridor } from '../shared/world-geometry';

describe('shared shot geometry', () => {
  it('only hits avatars in the forward shot corridor', () => {
    const shooter = { x: 100, y: 100 };
    expect(isInShotCorridor(shooter, { x: 250, y: 115 }, 'right')).toBe(true);
    expect(isInShotCorridor(shooter, { x: 250, y: 145 }, 'right')).toBe(false);
    expect(isInShotCorridor(shooter, { x: 50, y: 100 }, 'right')).toBe(false);
    expect(isInShotCorridor(shooter, { x: 100, y: 20 }, 'up')).toBe(true);
    expect(isInShotCorridor(shooter, { x: 100, y: 310 }, 'down')).toBe(false);
  });
});
