const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** A continuous floor descent; reduced motion keeps a short stationary fade. */
export function elevatorTrip(elapsedMs: number, fromGarage: boolean, toGarage: boolean, reduced = false, passenger = false) {
  // A clicked tour has time to read the change in viewpoint. An actual
  // passenger stays synchronized with the server; reduced motion stays brief.
  const elapsed = !passenger && !reduced ? elapsedMs / 1.35 : elapsedMs;
  if (reduced && !passenger) {
    const switched = elapsed >= 110;
    return { done: elapsed >= 240, garage: switched ? toGarage : fromGarage,
      veil: elapsed < 100 ? smooth(elapsed / 100) : 1 - smooth((elapsed - 130) / 110),
      door: 0, lift: 0, garage01: Number(switched ? toGarage : fromGarage) };
  }
  const switched = elapsed >= 760;
  const door = elapsed < 240 ? smooth(elapsed / 240)
    : elapsed < 490 ? 1 - smooth((elapsed - 240) / 250)
    : elapsed < 850 ? 0
    : elapsed < 1210 ? smooth((elapsed - 850) / 360)
    : 1 - smooth((elapsed - 1450) / 320);
  // A real passenger keeps the server's trip timing, with only a short fade and no camera motion.
  const passengerFade = elapsed < 760 ? smooth((elapsed - 660) / 100) : 1 - smooth((elapsed - 790) / 110);
  const travel = smooth((elapsed - 320) / 890);
  const garage01 = reduced ? Number(switched ? toGarage : fromGarage) : Number(fromGarage) + (Number(toGarage) - Number(fromGarage)) * travel;
  return { done: elapsed >= 1770, garage: switched ? toGarage : fromGarage,
    veil: reduced ? passengerFade : 0, door, lift: 0, garage01 };
}
