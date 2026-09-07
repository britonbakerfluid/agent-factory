import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  ArcadeController,
  RunTimer,
  TUNING,
  STEP,
  type CarId,
  type VehicleController,
} from "../src/racing/core";
import { SphereLabController } from "../src/racing/sphere-lab";
import { actualTrack } from "./terrain";
const track = actualTrack();
function drive(controller: VehicleController) {
  const run = new RunTimer(track);
  let maximumLateral = 0,
    maximumGap = 0,
    collisions = 0;
  const begin = performance.now();
  let steps = 0;
  for (; steps < 120 * 200 && !run.finished; steps++) {
    const s = controller.state;
    const look = Math.max(8, s.speed * 0.9),
      advance = Math.round((look / track.length) * track.samples.length);
    const target =
      track.samples[(s.contact.index + advance) % track.samples.length].p;
    const heading = Math.atan2(
      target.x - s.position.x,
      target.z - s.position.z,
    );
    const error = Math.atan2(
      Math.sin(heading - s.heading),
      Math.cos(heading - s.heading),
    );
    const future =
      track.samples[(s.contact.index + advance * 2) % track.samples.length]
        .tangent;
    const angle = Math.acos(
      Math.max(-1, Math.min(1, s.contact.tangent.dot(future))),
    );
    const desired = Math.min(30, Math.max(11, 30 - angle * 22));
    const old = s.position.clone();
    controller.step(
      {
        steer: Math.max(-1, Math.min(1, error * 2.4)),
        throttle: s.speed < desired ? 1 : 0,
        brake: s.speed > desired + 2 ? 0.5 : 0,
      },
      STEP,
    );
    run.step(old, s.position, STEP);
    maximumLateral = Math.max(maximumLateral, Math.abs(s.contact.lateral));
    maximumGap = Math.max(maximumGap, Math.abs(s.position.y - s.contact.p.y));
    if (s.impact > 0.05) collisions++;
    if (!Number.isFinite(s.position.y) || s.position.y < -100) break;
  }
  const report = {
    finished: run.finished,
    seconds: Number(run.total.toFixed(3)),
    checkpoints: run.nextGate - 1,
    maximumLateral: Number(maximumLateral.toFixed(3)),
    maximumGroundGap: Number(maximumGap.toFixed(3)),
    collisionSteps: collisions,
    cpuMilliseconds: Number((performance.now() - begin).toFixed(1)),
    steps,
  };
  controller.dispose();
  return report;
}
const baseline: Record<string, ReturnType<typeof drive>> = {};
for (const id of Object.keys(TUNING) as CarId[])
  baseline[id] = drive(new ArcadeController(track, TUNING[id]));
const sphere = drive(await SphereLabController.create(track, TUNING.porsche));
const report = {
  trackLengthMeters: Number(track.length.toFixed(1)),
  baseline,
  sphere,
  selection:
    "arcade baseline; sphere needs human handling review and must pass all physical checks before replacing it",
  note: "Scripted route-following is a physics regression check, not evidence of human game feel or phone performance.",
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(
  "evidence/drive-check.json",
  JSON.stringify(report, null, 2) + "\n",
);
for (const id of Object.keys(TUNING))
  assert.equal(baseline[id].finished, true, `${id} must finish the route`);
assert.ok(
  baseline.porsche.seconds >= 60 && baseline.porsche.seconds <= 90,
  "Porsche scripted lap should meet the planned route length",
);
