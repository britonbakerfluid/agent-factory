import { expect, it } from 'vitest';
import { musicMeterHeights, RoomMusicGain } from '../client/prototypes/factory25dMusicMeter';

it('fades between indoor volume and quieter patio playback without changing the listener fader', () => {
  const gain = new RoomMusicGain(); expect(gain.update(true, .05)).toBeLessThan(1); expect(gain.value).toBeGreaterThan(.6);
  for (let i=0;i<120;i++) gain.update(true, 1/60);
  expect(gain.value).toBeCloseTo(.6, 3);
  for (let i=0;i<120;i++) gain.update(false, 1/60);
  expect(gain.value).toBeCloseTo(1, 3);
  const value=gain.value; gain.update(true, NaN); expect(gain.value).toBe(value);
});

it('shows sharper playback pulses, measured SFX, and a still icon for silence or reduced motion', () => {
  const peak = musicMeterHeights(0, true, 0, true, false);
  const decay = musicMeterHeights(.3, true, 0, true, false);
  expect(peak[3]).toBeGreaterThan(decay[3] + 10);
  expect(musicMeterHeights(.3, false, .9, true, false)[3]).toBeGreaterThan(decay[3]);
  expect(musicMeterHeights(100, true, 1, false, false)).toEqual([2,3,5,7,5,3,2]);
  expect(musicMeterHeights(100, true, 1, true, true)).toEqual(musicMeterHeights(0, true, 1, true, true));
  expect(peak.every(h => h % 2 === 0 && h <= 30)).toBe(true);
});
