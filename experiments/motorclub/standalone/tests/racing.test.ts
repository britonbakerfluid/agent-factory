import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  createTrack,
  ArcadeController,
  RunTimer,
  TUNING,
  STEP,
  GATE_COUNT,
  validRecords,
  ranked,
  addRecord,
  bestFor,
  formatTime,
  ROAD_HALF,
  type CarId,
} from "../src/racing/core";
import { actualTrack } from "./terrain";
const track = createTrack(() => 0);
test("ordered forward checkpoints are required before finish", () => {
  const r = new RunTimer(track);
  const gate = track.gates[0];
  r.step(
    gate.p.clone().addScaledVector(gate.tangent, -1),
    gate.p.clone().addScaledVector(gate.tangent, 1),
    1,
  );
  assert.equal(r.nextGate, 1);
  assert.equal(r.finished, false);
  for (let i = 1; i <= GATE_COUNT; i++) {
    const g = track.gates[i % GATE_COUNT];
    r.step(
      g.p.clone().addScaledVector(g.tangent, -1),
      g.p.clone().addScaledVector(g.tangent, 1),
      1,
    );
  }
  assert.equal(r.finished, true);
  assert.equal(r.total, 16.5);
});
test("wrong-way and off-road crossings do not count", () => {
  const r = new RunTimer(track),
    g = track.gates[1];
  r.step(
    g.p.clone().addScaledVector(g.tangent, 1),
    g.p.clone().addScaledVector(g.tangent, -1),
    1,
  );
  assert.equal(r.nextGate, 1);
  r.step(
    g.p.clone().addScaledVector(g.tangent, -1).addScaledVector(g.right, 20),
    g.p.clone().addScaledVector(g.tangent, 1).addScaledVector(g.right, 20),
    1,
  );
  assert.equal(r.nextGate, 1);
});
test("reset preserves time and progression and adds exactly two seconds", () => {
  const r = new RunTimer(track),
    g = track.gates[1];
  r.step(
    g.p.clone().addScaledVector(g.tangent, -1),
    g.p.clone().addScaledVector(g.tangent, 1),
    5,
  );
  assert.equal(r.reset(), g);
  assert.equal(r.total, 7);
  assert.equal(r.nextGate, 2);
  r.reset();
  assert.equal(r.total, 9);
});
test("fixed-step simulation produces identical motion at 30, 60 and 144 fps", () => {
  const simulate = (fps: number) => {
    const car = new ArcadeController(track, TUNING.porsche);
    let accumulator = 0,
      steps = 0;
    for (let frame = 0; frame < fps * 5; frame++) {
      accumulator += 1 / fps;
      while (accumulator + 1e-10 >= STEP) {
        car.step({ steer: 0, throttle: 1, brake: 0 }, STEP);
        accumulator -= STEP;
        steps++;
      }
    }
    return { p: car.state.position, steps };
  };
  const base = simulate(30);
  for (const fps of [60, 144]) {
    const next = simulate(fps);
    assert.equal(next.steps, base.steps);
    assert.ok(next.p.distanceTo(base.p) < 1e-7);
  }
});
test("corrupt records are discarded and every car retains its personal best", () => {
  assert.deepEqual(validRecords("{bad"), []);
  assert.deepEqual(validRecords('[{"car":"unknown","ms":2}]'), []);
  assert.deepEqual(validRecords('[{"car":"__proto__","ms":2,"date":"x"}]'), []);
  let records = addRecord([], { car: "mini", ms: 100000, date: "mini" });
  for (let i = 0; i < 100; i++)
    records = addRecord(records, { car: "f1", ms: 60000 + i, date: String(i) });
  assert.equal(bestFor(records, "mini"), 100000);
  assert.equal(ranked(records).length, 5);
  assert.equal(ranked(records)[0].ms, 60000);
  assert.equal(formatTime(61987), "1:01.987");
});
test("real terrain road stays above the source mesh at its driving edges", () => {
  const real = actualTrack();
  let gap = Infinity;
  for (const s of real.samples)
    for (const offset of [-ROAD_HALF, 0, ROAD_HALF])
      gap = Math.min(
        gap,
        s.p.y -
          real.heightAt(s.p.x + s.right.x * offset, s.p.z + s.right.z * offset),
      );
  assert.ok(gap >= 0, `minimum clearance ${gap}`);
  assert.ok(real.length > 1000 && real.length < 2000, `length ${real.length}`);
});
test("all cars remain finite through hill starts, braking, steering and resets", () => {
  const real = actualTrack();
  for (const id of Object.keys(TUNING) as CarId[]) {
    const c = new ArcadeController(real, TUNING[id]);
    c.reset(real.samples[220]);
    for (let i = 0; i < 900; i++) {
      c.step(
        {
          steer: i > 500 ? 0.4 : 0,
          throttle: i < 500 ? 1 : 0,
          brake: i > 500 ? 1 : 0,
        },
        STEP,
      );
      assert.ok(Number.isFinite(c.state.position.y));
      assert.ok(c.state.speed < TUNING[id].maxSpeed * 1.3);
    }
    c.reset(real.samples[500]);
    assert.equal(c.state.speed, 0);
    assert.equal(c.state.position.distanceTo(real.samples[500].p), 0);
  }
});
test("long vehicle nose and tail cannot push through a closed guardrail", () => {
  const c = new ArcadeController(track, TUNING.porsche);
  c.reset(track.samples[100]);
  c.state.position.addScaledVector(c.state.contact.right, ROAD_HALF - 0.1);
  c.state.heading += Math.PI / 2;
  c.state.velocity.copy(c.state.contact.right).multiplyScalar(20);
  for (let i = 0; i < 120; i++)
    c.step({ steer: 0, throttle: 1, brake: 0 }, STEP);
  assert.ok(Math.abs(c.state.contact.lateral) < ROAD_HALF + 0.5);
  assert.ok(c.state.speed < 10);
});

test("a waiting car holds its position on an uphill start", () => {
  const real = actualTrack(),
    car = new ArcadeController(real, TUNING.delorean);
  const start = car.state.position.clone();
  for (let i = 0; i < 600; i++)
    car.step({ steer: 0, throttle: 0, brake: 0 }, STEP);
  assert.ok(car.state.position.distanceTo(start) < 0.001);
});

function movingCar(){
  const c=new ArcadeController(track,TUNING.mini);
  c.state.velocity.copy(track.samples[0].tangent).multiplyScalar(15);
  c.state.speed=15;
  return c;
}
test("drift requires speed and steering, charges on track, and countersteer keeps its direction",()=>{
  const c=movingCar();
  c.step({steer:0,throttle:1,brake:0,drift:true},STEP);
  assert.equal(c.state.driftDirection,0);
  for(let i=0;i<30;i++)c.step({steer:.4,throttle:1,brake:0,drift:true},STEP);
  assert.equal(c.state.driftDirection,1);
  assert.ok(c.state.driftCharge>.2);
  const charge=c.state.driftCharge;
  c.step({steer:-1,throttle:1,brake:0,drift:true},STEP);
  assert.equal(c.state.driftDirection,1);
  assert.equal(c.state.driftCharge,charge);
});
test("only a charged clean release earns boost, gold lasts longer, and reset clears it",()=>{
  function release(charge:number,brake=0){
    const c=movingCar();c.state.driftDirection=1;c.state.driftCharge=charge;
    c.step({steer:0,throttle:1,brake,drift:false},STEP);return c;
  }
  assert.equal(release(.3).state.boost,0);
  assert.equal(release(1.5,1).state.boost,0);
  const blue=release(.8),gold=release(1.5);
  assert.ok(blue.state.boost>0);
  assert.ok(gold.state.boost>blue.state.boost);
  assert.ok(blue.state.speed>release(.3).state.speed);
  gold.reset(track.samples[0]);assert.equal(gold.state.boost,0);assert.equal(gold.state.driftCharge,0);
  const interrupted=release(1.5);interrupted.cancelDrift();assert.equal(interrupted.state.boost,0);
});
