import {test} from "node:test";
import assert from "node:assert/strict";
import {Matrix4, Vector3} from "three";
import {actualTerrain, actualTrack} from "./terrain";
import {createRoadGround} from "../src/racing/road-ground";
import {sculptRoadBed} from "../src/racing/sculpt-road-bed";
import {createTerrainSampler} from "../src/reference/factory25dTerrainSampler";
import {TireMarks} from "../src/racing/tire-marks";
import {ArcadeController, createTrack, TUNING, WORLD_SCALE} from "../src/racing/core";

test("the rendered Blender road bed stays below the full road and both shoulders", () => {
  const track = actualTrack(), grade = createRoadGround(track), original = actualTerrain();
  const terrain = sculptRoadBed(original, new Matrix4().makeScale(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE), grade);
  const sample = createTerrainSampler(terrain, () => -0.6);
  for (const s of track.samples) {
    for (const side of [-5.7, -4.6, -3, 0, 3, 4.6, 5.7]) {
      const x = s.p.x + s.right.x * side, z = s.p.z + s.right.z * side;
      const clearance = s.p.y - sample(x / WORLD_SCALE, z / WORLD_SCALE) * WORLD_SCALE;
      assert.ok(clearance > 0.035, `terrain clips the road at ${s.distance.toFixed(1)} m`);
      assert.ok(clearance < 0.3, `road loses contact with its bed at ${s.distance.toFixed(1)} m`);
    }
  }
  assert.ok(terrain.index!.count / 3 < 120_000, "road refinement must stay within the scene geometry budget");
  original.dispose(); terrain.dispose();
});

test("tire marks require a drift and never bridge resets or non-driving moments", () => {
  const track = createTrack(() => 0), car = new ArcadeController(track, TUNING.porsche), marks = new TireMarks(track);
  const state = car.state;
  state.speed = 20;
  const rear = (distance: number) => [-1, 1].map(side => state.contact.p.clone()
    .addScaledVector(state.contact.right, side).addScaledVector(state.contact.tangent, distance));
  marks.update(1 / 60, state, rear(0), true);
  marks.update(1 / 60, state, rear(1), true);
  assert.equal(marks.mesh.geometry.drawRange.count, 0, "ordinary driving should not paint marks");
  state.driftDirection = 1;
  marks.update(1 / 60, state, rear(0), true);
  marks.update(1 / 60, state, rear(1), true);
  assert.equal(marks.mesh.geometry.drawRange.count, 12, "both rear tires should leave a strip");
  marks.breakTrail();
  marks.update(1 / 60, state, rear(3), true);
  assert.equal(marks.mesh.geometry.drawRange.count, 12, "a reset starts a fresh trail without a joining streak");
  marks.update(1 / 60, state, rear(4), false);
  marks.update(1 / 60, state, rear(5), true);
  assert.equal(marks.mesh.geometry.drawRange.count, 12, "pause or returning to the garage must break the trail");
  marks.clear();
  assert.equal(marks.mesh.geometry.drawRange.count, 0);
  marks.mesh.geometry.dispose(); (marks.mesh.material as {dispose(): void}).dispose();
});
