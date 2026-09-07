export const VENDING_ROCK_LIMITS = { angle: .045, speed: .9 } as const;

/** Rigid cabinet rocking between its bottom edges. Clicks add bounded angular
 * momentum to the current motion; gravity and lossy floor contact settle it.
 * No scale animation, queued tweens, or accumulated movement across the floor. */
export class VendingCabinetRock {
  private pitch = 0;
  private speed = 0;
  private reduced = false;

  constructor(private halfDepth = .31, private halfHeight = .68) {}

  get angle() { return this.pitch; }
  get angularVelocity() { return this.speed; }
  private nudge(impulse: number) {
    if (!this.reduced) this.speed = Math.max(-VENDING_ROCK_LIMITS.speed,
      Math.min(VENDING_ROCK_LIMITS.speed, this.speed + impulse));
  }
  press() { this.nudge(-.65); }
  release() { this.nudge(-.07); }

  update(deltaSeconds: number, reduced = false, visible = true) {
    this.reduced = reduced;
    if (reduced) { this.pitch = this.speed = 0; return this.pose; }
    if (!visible || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.pose;
    const total = Math.min(deltaSeconds, .1), steps = Math.ceil(total * 240), dt = total / steps;
    const gravity = 3 * 9.81 / (4 * (this.halfDepth ** 2 + this.halfHeight ** 2));
    for (let step = 0; step < steps; step++) {
      if (Math.abs(this.pitch) < .00006 && Math.abs(this.speed) < .025) {
        this.pitch = this.speed = 0; break;
      }
      const previous = this.pitch, side = Math.sign(previous || this.speed);
      const restoring = gravity * (this.halfDepth * Math.cos(previous)
        - this.halfHeight * Math.sin(Math.abs(previous)));
      this.speed += (-side * restoring - this.speed * 3) * dt;
      this.pitch += this.speed * dt;
      if (previous * this.pitch < 0) {
        // The other pair of feet lands. Most energy goes into that contact,
        // leaving one small follow-through instead of elastic wobbling.
        this.pitch = 0; this.speed *= .22;
      }
      if (Math.abs(this.pitch) > VENDING_ROCK_LIMITS.angle) {
        this.pitch = Math.sign(this.pitch) * VENDING_ROCK_LIMITS.angle;
        if (this.pitch * this.speed > 0) this.speed = 0;
      }
    }
    return this.pose;
  }

  get pose() {
    const pivotZ = Math.sign(this.pitch) * this.halfDepth;
    return { pitch: this.pitch,
      // Rotate about the supporting bottom edge, keeping that edge on the
      // floor. The complete body, glass and labels keep their exact dimensions.
      y: pivotZ * Math.sin(this.pitch),
      z: pivotZ * (1 - Math.cos(this.pitch)) };
  }
}
