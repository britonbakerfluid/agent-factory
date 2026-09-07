import { ROAD_HALF, type Track } from "./core";

/** Cut/fill the original painted terrain, instead of covering it with a second mound. */
export function createRoadGround(track: Track) {
  const naturalHeight = track.heightAt;
  const bed = ROAD_HALF + 3.2, reach = 26, cellSize = 12;
  const cells = new Map<string, number[]>();
  for (let i = 0; i < track.samples.length; i++) {
    const a = track.samples[i].p, b = track.samples[(i + 1) % track.samples.length].p;
    for (let x = Math.floor((Math.min(a.x, b.x) - reach) / cellSize); x <= Math.floor((Math.max(a.x, b.x) + reach) / cellSize); x++)
      for (let z = Math.floor((Math.min(a.z, b.z) - reach) / cellSize); z <= Math.floor((Math.max(a.z, b.z) + reach) / cellSize); z++) {
        const key = `${x},${z}`, bucket = cells.get(key) ?? [];
        bucket.push(i); cells.set(key, bucket);
      }
  }
  function nearest(x: number, z: number) {
    let distance = Infinity, y = 0;
    for (const i of cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
      const a = track.samples[i].p, b = track.samples[(i + 1) % track.samples.length].p;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < distance) { distance = d; y = a.y + (b.y - a.y) * t; }
    }
    return { distance, y };
  }
  return {
    distanceAt: (x: number, z: number) => nearest(x, z).distance,
    heightAt(x: number, z: number) {
      const natural = naturalHeight(x, z), near = nearest(x, z);
      if (near.distance >= reach) return natural;
      const t = Math.max(0, Math.min(1, (near.distance - bed) / (reach - bed)));
      const blend = t * t * (3 - 2 * t);
      return (near.y - 0.18) * (1 - blend) + natural * blend;
    },
  };
}
