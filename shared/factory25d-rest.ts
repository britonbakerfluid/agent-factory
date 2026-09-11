/** Rest stops face the room's activities; the first stop boards the orange chair. */
export const BEANBAG_REST = { approach: { x: 1.64, z: 10.1 }, seat: { x: .88, z: 10.06 }, height: .48 };
export const FACTORY_REST_STOPS = [
  BEANBAG_REST.approach,
  ...[-6.25, -4.4, -2.2, 0, 2.2, 4.4, 6.35].map(x => ({ x, z: -3.1 })),
  { x: 2.2, z: 6.7 }, { x: 4.8, z: 6.7 },
];
