// Route copied from the approved garage time trial; keep the control points in sync.
import { CatmullRomCurve3, Vector3 } from "three";

export const WORLD_SCALE = 22;
export const ROAD_HALF = 4.6;
export const SAMPLE_COUNT = 960;
export const GATE_COUNT = 16;
export interface TrackSample {
  p: Vector3;
  tangent: Vector3;
  right: Vector3;
  distance: number;
}
export interface Track {
  samples: TrackSample[];
  length: number;
  gates: TrackSample[];
  heightAt: (x: number, z: number) => number;
}
const knots = [
  [0, 4],
  [-2.5, 4],
  [-5.5, 2.5],
  [-7, -0.5],
  [-6, -3.5],
  [-3, -5],
  [-2.8, -7.5],
  [-6.5, -8.7],
  [-7.5, -11.5],
  [-5.5, -13.5],
  [-2, -12.6],
  [0.5, -10],
  [3, -10.6],
  [5.5, -12.3],
  [7.6, -10],
  [5.2, -7],
  [6.8, -3.6],
  [5.8, -0.6],
  [3.8, 2.4],
  [1.8, 4],
];
export function createTrack(heightAt: (x: number, z: number) => number): Track {
  const curve = new CatmullRomCurve3(
    knots.map(([x, z]) => new Vector3(x * WORLD_SCALE, 0, z * WORLD_SCALE)),
    true,
    "centripetal",
  );
  const pts = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, SAMPLE_COUNT);
  // Average the terrain instead of lifting the entire road above the highest
  // nearby rock. The landscape grades a cut/fill corridor to this surface.
  const base = pts.map(p => heightAt(p.x, p.z));
  const ys = base.map((_, i) =>
    Array.from({length:25}, (_,j) => base[(i+j-12+SAMPLE_COUNT)%SAMPLE_COUNT])
      .reduce((a,b)=>a+b,0)/25,
  );
  for (let pass=0;pass<12;pass++)
    for (const direction of [1,-1])
      for(let j=0;j<SAMPLE_COUNT;j++) {
        const i=direction===1?j:SAMPLE_COUNT-1-j;
        const n=(i+direction+SAMPLE_COUNT)%SAMPLE_COUNT;
        const limit=pts[i].distanceTo(pts[n])*.4;
        const excess=Math.abs(ys[n]-ys[i])-limit;
        if(excess>0){const correction=Math.sign(ys[n]-ys[i])*excess*.5;ys[n]-=correction;ys[i]+=correction;}
      }
  pts.forEach((p, i) => (p.y = ys[i]));
  let length = 0;
  const samples = pts.map((p, i) => {
    if (i) length += p.distanceTo(pts[i - 1]);
    const tangent = pts[(i + 1) % SAMPLE_COUNT]
      .clone()
      .sub(pts[(i + SAMPLE_COUNT - 1) % SAMPLE_COUNT])
      .normalize();
    return {
      p,
      tangent,
      right: new Vector3(tangent.z, 0, -tangent.x).normalize(),
      distance: length,
    };
  });
  length += pts[0].distanceTo(pts[SAMPLE_COUNT - 1]);
  return {
    samples,
    length,
    gates: Array.from(
      { length: GATE_COUNT },
      (_, i) => samples[Math.floor((i * SAMPLE_COUNT) / GATE_COUNT)],
    ),
    heightAt,
  };
}
