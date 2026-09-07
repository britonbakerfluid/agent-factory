import { readFileSync } from "node:fs";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { createTerrainSampler } from "../src/reference/factory25dTerrainSampler";
import { createTrack, WORLD_SCALE } from "../src/racing/core";
export function actualTerrain() {
  const data = readFileSync(
    new URL("../public/models/utah-mountains.glb", import.meta.url),
  );
  const jsonLength = data.readUInt32LE(12),
    g = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binary = 20 + jsonLength + 8;
  const primitive = g.meshes[0].primitives[0];
  function accessor(id: number) {
    const a = g.accessors[id],
      view = g.bufferViews[a.bufferView],
      width = a.type === "VEC3" ? 3 : 1,
      bytes = a.componentType === 5123 ? 2 : 4,
      result: number[] = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < width; j++) {
        const offset =
          binary +
          (view.byteOffset || 0) +
          (a.byteOffset || 0) +
          i * (view.byteStride || width * bytes) +
          j * bytes;
        result.push(
          a.componentType === 5126
            ? data.readFloatLE(offset)
            : a.componentType === 5123
              ? data.readUInt16LE(offset)
              : data.readUInt32LE(offset),
        );
      }
    return result;
  }
  const geo = new BufferGeometry();
  geo.setAttribute(
    "position",
    new Float32BufferAttribute(accessor(primitive.attributes.POSITION), 3),
  );
  geo.setIndex(accessor(primitive.indices));
  return geo;
}
export function actualTrack() {
  const geo = actualTerrain();
  const sample = createTerrainSampler(geo, () => -0.6);
  return createTrack(
    (x, z) => sample(x / WORLD_SCALE, z / WORLD_SCALE) * WORLD_SCALE,
  );
}
