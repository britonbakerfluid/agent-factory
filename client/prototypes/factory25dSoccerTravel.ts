import { FACTORY_BODY_RADIUS, FACTORY_OBSTACLES, FACTORY_WINDOW_FRONT_Z } from '@shared/factory25d-layout';

const RADIUS = .14, SPEED_LIMIT = 8;
// The navigation boxes already contain an agent-sized clearance. Use ball size.
const inset = FACTORY_BODY_RADIUS - RADIUS;
const obstacles = FACTORY_OBSTACLES.filter(o => o.left < 8 && o.near < 14 && o.far > -5)
  .map(o => ({left: o.left + inset, right: o.right - inset, near: o.near + inset, far: o.far - inset}));

/** A single bounded body: kicks cannot allocate props or tunnel through room walls. */
export class SoccerTravel {
  vx = 0; vz = 0;
  constructor(public x: number, public z: number) {}
  get moving() { return this.vx !== 0 || this.vz !== 0; }
  stop() { this.vx = this.vz = 0; }
  release(vx: number, vz: number, reduced = false) {
    if (!Number.isFinite(vx) || !Number.isFinite(vz)) { this.stop(); return; }
    const speed = Math.hypot(vx, vz), scale = Math.min(1, (reduced ? 3 : SPEED_LIMIT) / (speed || 1));
    this.vx = speed < .35 ? 0 : vx * scale; this.vz = speed < .35 ? 0 : vz * scale;
  }
  place(x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.x = x; this.z = z; this.resolve();
  }
  private resolve() {
    const x = this.x, z = this.z;
    this.x = Math.max(-7.72, Math.min(7.72, this.x));
    this.z = Math.max(FACTORY_WINDOW_FRONT_Z + RADIUS + .04, Math.min(13.72, this.z));
    if (this.x !== x) this.vx *= -.58;
    if (this.z !== z) this.vz *= -.58;
    for (let pass = 0; pass < 4; pass++) {
      let hit = false;
      for (const o of obstacles) {
        if (this.x <= o.left || this.x >= o.right || this.z <= o.near || this.z >= o.far) continue;
        hit = true;
        const distances = [this.x - o.left, o.right - this.x, this.z - o.near, o.far - this.z];
        const side = distances.indexOf(Math.min(...distances));
        if (side < 2) { this.x = side === 0 ? o.left : o.right; this.vx = (side === 0 ? -1 : 1) * Math.abs(this.vx) * .58; }
        else { this.z = side === 2 ? o.near : o.far; this.vz = (side === 2 ? -1 : 1) * Math.abs(this.vz) * .58; }
      }
      if (!hit) break;
    }
    this.x = Math.max(-7.72, Math.min(7.72, this.x));
    this.z = Math.max(FACTORY_WINDOW_FRONT_Z + RADIUS + .04, Math.min(13.72, this.z));
  }
  update(dt: number, airborne: boolean) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, .25);
    while (remaining > .000001 && this.moving) {
      const step = Math.min(remaining, 1 / 120), drag = airborne ? .7 : 2.3, decay = Math.exp(-drag * step);
      this.x += this.vx * (1 - decay) / drag; this.z += this.vz * (1 - decay) / drag;
      this.vx *= decay; this.vz *= decay; this.resolve(); remaining -= step;
      if (Math.hypot(this.vx, this.vz) < .035) this.stop();
    }
  }
}
