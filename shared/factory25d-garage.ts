/** Display cars use the same world scale as the factory avatars and furniture. */
export const GARAGE_CAR_IDS = ['porsche', 'mini', 'delorean', 'f1'] as const;
export type GarageCarId = typeof GARAGE_CAR_IDS[number];
export const GARAGE_CAR_SCALE = .75;
export const GARAGE_CAR_YAW = Math.PI - .52;
export const GARAGE_CAR_VISIT_MS = 12_000;
export const GARAGE_RAMP = { left: 9.79, right: 11.9, near: 5.2, far: -4.1, rise: 1.25, doorZ: -4.18 } as const;
export function garageRampHeightAt(x: number, z: number) {
  return x >= GARAGE_RAMP.left && x <= GARAGE_RAMP.right && z < GARAGE_RAMP.near
    ? Math.max(0, Math.min(1, (GARAGE_RAMP.near - z) / (GARAGE_RAMP.near - GARAGE_RAMP.far))) * GARAGE_RAMP.rise : 0;
}
export const GARAGE_CAR_BAYS = Object.fromEntries(GARAGE_CAR_IDS.map((id, i) => [id, { x: -4.6 + i * 4.2, z: .25 }])) as Record<GarageCarId, { x: number; z: number }>;
/** Measured GLB body bounds at the display scale/yaw; exclude open-door motion. */
export const GARAGE_PARKED_BOUNDS: Record<GarageCarId, {left:number;right:number;near:number;far:number}> = {
  porsche:{left:-.827184,right:.846341,near:-1.091161,far:1.019193},
  mini:{left:-.683252,right:.690792,near:-.865783,far:.856434},
  delorean:{left:-.854290,right:.883151,near:-1.119620,far:1.080331},
  f1:{left:-1.045705,right:1.106886,near:-1.337100,far:1.160380},
};
export function isGarageCarId(value: unknown): value is GarageCarId { return GARAGE_CAR_IDS.includes(value as GarageCarId); }
export function garageCarLookout(car: GarageCarId) { return { x: GARAGE_CAR_BAYS[car].x - .75, z: 24 + 3.05 }; }

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
/** Shared clock: approach door, board, two short blips, leave, return to the safe lookout. */
export function garageCarVisitPose(elapsed: number) {
  const walkingIn = elapsed >= 0 && elapsed < 2400, boarding = elapsed >= 2400 && elapsed < 3500;
  const seated = elapsed >= 3500 && elapsed < 8700, leaving = elapsed >= 8700 && elapsed < 9800;
  const walkingOut = elapsed >= 9800 && elapsed < GARAGE_CAR_VISIT_MS;
  const approach = walkingIn ? smooth(elapsed / 2400) : walkingOut ? 1 - smooth((elapsed - 9800) / 2200) : elapsed < 0 || elapsed >= GARAGE_CAR_VISIT_MS ? 0 : 1;
  const seat = boarding ? smooth((elapsed - 2400) / 1100) : leaving ? 1 - smooth((elapsed - 8700) / 1100) : seated ? 1 : 0;
  const opening = Math.max(smooth((elapsed - 1850) / 550) * (1 - smooth((elapsed - 3500) / 550)), smooth((elapsed - 8150) / 550) * (1 - smooth((elapsed - 9800) / 550)));
  const blip = (start: number, end: number) => smooth((elapsed - start) / 350) * (1 - smooth((elapsed - end) / 650));
  const throttle = seated ? Math.max(blip(4550, 5300), blip(6550, 7300)) : 0;
  return { approach, seat, door: opening, throttle, engine: elapsed >= 4050 && elapsed < 8050,
    walking: walkingIn || walkingOut, phase: walkingIn ? 'walking to the car' : boarding ? 'getting in' : seated ? throttle > .1 ? 'revving' : 'in the driver’s seat' : leaving ? 'getting out' : walkingOut ? 'stepping back' : '' };
}
