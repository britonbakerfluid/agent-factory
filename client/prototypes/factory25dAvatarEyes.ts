import type { AvatarEyes } from '../rendering/avatarPainter';

export const AVATAR_EYES: readonly AvatarEyes[] = ['center', 'left', 'right', 'up', 'blink'];
const fraction = (value: number) => value - Math.floor(value);
const noise = (seed: number) => fraction(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);

/** Independent of footsteps: brief blinks, held glances, and long quiet intervals. */
export function avatarEyePose(elapsed: number, seed: number, mode: 'relaxed' | 'thinking' | 'attentive' | 'moving' | 'asleep' = 'relaxed', frozen = false): AvatarEyes {
  if (mode === 'asleep') return 'blink';
  if (frozen || !Number.isFinite(elapsed)) return 'center';
  const clock = Math.max(0, elapsed) + noise(seed) * 17;
  const blinkPeriod = 3.2 + noise(seed + 1) * 2.3;
  const blinkCycle = Math.floor(clock / blinkPeriod), blinkTime = clock % blinkPeriod;
  if (blinkTime < .12 || (noise(seed + blinkCycle * 7) > .78 && blinkTime > .25 && blinkTime < .34)) return 'blink';
  if (mode === 'attentive' || mode === 'moving') return 'center';
  const period = 5.4 + noise(seed + 2) * 2.6;
  const cycle = Math.floor(clock / period), phase = clock % period;
  // Keep the eyes still for over 75% of the cycle. A glance moves just one pixel.
  if (phase < 2 || phase > 2.65 + noise(seed + cycle + 3) * .65) return 'center';
  if (mode === 'thinking' && noise(seed + cycle + 4) > .35) return 'up';
  return noise(seed + cycle * 3 + 5) > .5 ? 'left' : 'right';
}
