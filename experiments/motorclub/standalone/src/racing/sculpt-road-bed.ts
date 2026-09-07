import * as THREE from "three";
import type {createRoadGround} from "./road-ground";

/** Refine only the road corridor so broad, decimated triangles cannot cut the road. */
export function sculptRoadBed(source: THREE.BufferGeometry, toWorld: THREE.Matrix4, ground: ReturnType<typeof createRoadGround>) {
  const attributes = Object.entries(source.attributes);
  const values = attributes.map(([, attribute]) => {
    const data: number[] = [];
    for (let i = 0; i < attribute.count; i++)
      for (let c = 0; c < attribute.itemSize; c++) data.push(attribute.getComponent(i, c));
    return data;
  });
  const originalPosition = source.getAttribute("position");
  const points: THREE.Vector3[] = [], distances: number[] = [];
  for (let i = 0; i < originalPosition.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(originalPosition, i).applyMatrix4(toWorld);
    points.push(p); distances.push(ground.distanceAt(p.x, p.z));
  }
  const midpoints = new Map<string, number>();
  function midpoint(a: number, b: number) {
    const key = a < b ? `${a},${b}` : `${b},${a}`, existing = midpoints.get(key);
    if (existing !== undefined) return existing;
    const id = points.length, p = points[a].clone().lerp(points[b], 0.5);
    points.push(p); distances.push(ground.distanceAt(p.x, p.z));
    attributes.forEach(([, attribute], attr) => {
      for (let c = 0; c < attribute.itemSize; c++)
        values[attr].push((values[attr][a * attribute.itemSize + c] + values[attr][b * attribute.itemSize + c]) / 2);
    });
    midpoints.set(key, id); return id;
  }
  const indices: number[] = [];
  function triangle(a: number, b: number, c: number, depth: number) {
    const ab = points[a].distanceToSquared(points[b]), bc = points[b].distanceToSquared(points[c]), ca = points[c].distanceToSquared(points[a]);
    const largest = Math.max(ab, bc, ca);
    const centerX = (points[a].x + points[b].x + points[c].x) / 3;
    const centerZ = (points[a].z + points[b].z + points[c].z) / 3;
    const nearby = Math.min(distances[a], distances[b], distances[c], ground.distanceAt(centerX, centerZ));
    if (depth < 8 && largest > 1.8 ** 2 && nearby < 12 + Math.sqrt(largest) * 0.5) {
      // Bisect the longest edge, sharing interpolated paint colors along that edge.
      if (largest === ab) { const m = midpoint(a, b); triangle(a, m, c, depth + 1); triangle(m, b, c, depth + 1); }
      else if (largest === bc) { const m = midpoint(b, c); triangle(a, b, m, depth + 1); triangle(a, m, c, depth + 1); }
      else { const m = midpoint(c, a); triangle(a, b, m, depth + 1); triangle(m, b, c, depth + 1); }
    } else indices.push(a, b, c);
  }
  const count = source.index?.count ?? originalPosition.count;
  const vertex = (i: number) => source.index ? source.index.getX(i) : i;
  for (let i = 0; i < count; i += 3) triangle(vertex(i), vertex(i + 1), vertex(i + 2), 0);
  // Propagate shared edge splits to neighboring coarse faces so the grade stays watertight.
  const conforming: number[] = [];
  function conform(a: number, b: number, c: number) {
    const ab = midpoints.get(a < b ? `${a},${b}` : `${b},${a}`);
    const bc = midpoints.get(b < c ? `${b},${c}` : `${c},${b}`);
    const ca = midpoints.get(c < a ? `${c},${a}` : `${a},${c}`);
    if (ab !== undefined) { conform(a, ab, c); conform(ab, b, c); }
    else if (bc !== undefined) { conform(a, b, bc); conform(a, bc, c); }
    else if (ca !== undefined) { conform(a, b, ca); conform(ca, b, c); }
    else conforming.push(a, b, c);
  }
  for (let i = 0; i < indices.length; i += 3) conform(indices[i], indices[i + 1], indices[i + 2]);
  const result = new THREE.BufferGeometry(), positionIndex = attributes.findIndex(([name]) => name === "position");
  const inverse = toWorld.clone().invert();
  points.forEach((p, i) => {
    p.y = ground.heightAt(p.x, p.z); p.applyMatrix4(inverse);
    values[positionIndex][i * 3] = p.x; values[positionIndex][i * 3 + 1] = p.y; values[positionIndex][i * 3 + 2] = p.z;
  });
  attributes.forEach(([name, attribute], i) => result.setAttribute(name, new THREE.Float32BufferAttribute(values[i], attribute.itemSize)));
  result.setIndex(conforming); result.computeVertexNormals(); result.computeBoundingSphere();
  return result;
}
