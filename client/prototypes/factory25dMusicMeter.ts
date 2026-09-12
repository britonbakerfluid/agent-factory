/** Room attenuation changes the listener's gain, never the shared song clock. */
export class RoomMusicGain {
  value = 1;
  update(outside: boolean, dt: number) {
    if (Number.isFinite(dt) && dt > 0) this.value += ((outside ? .6 : 1) - this.value) * (1 - Math.exp(-Math.min(dt, .1) * 3.5));
    return this.value;
  }
}

/** YouTube exposes playback time, not PCM. This is a rhythmic playback indicator,
 * not a spectrum analyser; the separate SFX input is measured audio energy. */
export function musicMeterHeights(time: number, music: boolean, sfx: number, audible: boolean, reduced: boolean) {
  const rest = audible ? [3, 5, 8, 11, 8, 5, 3] : [2, 3, 5, 7, 5, 3, 2];
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  const beat = seconds * 92 / 60;
  const phase = beat % 1, half = (beat * 2) % 1;
  const downbeat = Math.floor(beat) % 4 === 0 ? 1 : .76;
  return rest.map((height, index) => {
    if (reduced || !audible) return height;
    const center = 1 - Math.abs(index - 3) / 4;
    const kick = music ? Math.exp(-phase * 10) * downbeat : 0;
    const hat = music ? Math.exp(-half * 15) * (.18 + (index % 2) * .18) : 0;
    const energy = Math.max(kick * (.35 + center * .65) + hat, Math.max(0, Math.min(1, sfx)) * center);
    return 2 * Math.round((height + Math.min(1, energy) * 18) / 2);
  });
}
