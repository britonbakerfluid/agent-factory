// Research-only adapter. Not imported by the shipped game.
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "three";
import {
  roadContact,
  ROAD_HALF,
  type VehicleController,
  type VehicleState,
  type DrivingInput,
  type Track,
  type TrackSample,
  type CarTuning,
} from "./core";
export class SphereLabController implements VehicleController {
  state: VehicleState;
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  radius = 1.2;
  static async create(track: Track, tuning: CarTuning) {
    await RAPIER.init();
    return new SphereLabController(track, tuning);
  }
  private constructor(
    public track: Track,
    public tuning: CarTuning,
  ) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const vertices: number[] = [],
      indices: number[] = [];
    for (let i = 0; i < track.samples.length; i++) {
      const s = track.samples[i];
      for (const [side, y] of [
        [-1, 0],
        [1, 0],
        [-1, 1.5],
        [1, 1.5],
      ])
        vertices.push(
          s.p.x + s.right.x * side * (ROAD_HALF + 1.25),
          s.p.y + y,
          s.p.z + s.right.z * side * (ROAD_HALF + 1.25),
        );
      const k = i * 4,
        n = ((i + 1) % track.samples.length) * 4;
      indices.push(
        k,
        n,
        k + 1,
        k + 1,
        n,
        n + 1,
        k,
        k + 2,
        n,
        k + 2,
        n + 2,
        n,
        k + 1,
        n + 1,
        k + 3,
        k + 3,
        n + 1,
        n + 3,
      );
    }
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(vertices),
        new Uint32Array(indices),
      )
        .setFriction(0.7)
        .setRestitution(0),
    );
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.radius)
        .setDensity(1)
        .setFriction(0.7)
        .setRestitution(0),
      this.body,
    );
    this.state = {
      position: new Vector3(),
      velocity: new Vector3(),
      heading: 0,
      speed: 0,
      steer: 0,
      slip: 0,
      contact: roadContact(track, track.samples[0].p),
      impact: 0,
      driftDirection: 0, driftCharge: 0, boost: 0,
    };
    this.reset(track.samples[0]);
  }
  reset(sample: TrackSample) {
    this.body.setTranslation(
      { x: sample.p.x, y: sample.p.y + this.radius + 0.02, z: sample.p.z },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    const s = this.state;
    s.position.copy(sample.p);
    s.velocity.set(0, 0, 0);
    s.heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    s.speed = 0;
    s.steer = 0;
    s.slip = 0;
    s.contact = roadContact(this.track, s.position);
  }
  step(input: DrivingInput, dt: number) {
    const s = this.state,
      t = this.tuning,
      velocity = this.body.linvel();
    s.velocity.set(velocity.x, velocity.y, velocity.z);
    const forward = new Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    const signed = s.velocity.dot(forward);
    s.steer += (input.steer - s.steer) * (1 - Math.exp(-9 * dt));
    s.heading +=
      ((s.steer * t.steering * Math.min(1, Math.abs(signed) / 5)) /
        (1 + Math.abs(signed) / 36)) *
      Math.sign(signed || 1) *
      dt;
    forward.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const right = new Vector3(forward.z, 0, -forward.x),
      lateral = s.velocity.dot(right);
    const grip =
      input.brake > 0.1 && Math.abs(s.steer) > 0.15 && signed > 7
        ? t.driftGrip
        : t.grip;
    const force = forward
      .clone()
      .multiplyScalar(
        input.throttle *
          t.acceleration *
          Math.max(0, 1 - Math.max(0, signed) / t.maxSpeed),
      );
    if (input.brake && signed > 0.1)
      force.addScaledVector(forward, -Math.min(t.braking, signed / dt));
    else if (input.reverse && input.brake && signed <= 0.1 && signed > -5)
      force.addScaledVector(forward, -4);
    force
      .addScaledVector(right, -lateral * grip)
      .addScaledVector(s.velocity, -0.025)
      .multiplyScalar(this.body.mass());
    this.body.resetForces(true);
    this.body.addForce(force, true);
    this.world.timestep = dt;
    this.world.step();
    const p = this.body.translation(),
      v = this.body.linvel();
    s.position.set(p.x, p.y - this.radius, p.z);
    s.velocity.set(v.x, v.y, v.z);
    s.speed = Math.hypot(v.x, v.z);
    s.contact = roadContact(this.track, s.position);
    s.slip = Math.abs(
      Math.atan2(
        s.velocity.dot(right),
        Math.abs(s.velocity.dot(forward)) + 0.1,
      ),
    );
  }
  dispose() {
    this.world.free();
  }
}
