const GRAVITY = 5.8;
const SPIN_DAMPING = 1.8;

/** A kick redirects the ball's current velocity without restarting its pose. */
export class SoccerJuggle {
  height = 0;
  velocity = 0;
  spin = 0;
  angularVelocity = 0;
  touches = 0;
  private reduced = false;

  get airborne() { return this.height > 0 || this.velocity > 0; }
  get ceiling() { return this.reduced ? .34 : 1.3; }

  kick(reduced = this.reduced) {
    this.reduced = reduced;
    if (!this.airborne) this.touches = 0;
    this.touches += 1;
    // Always leave enough gravitational braking distance to stay below the cap,
    // even if somebody clicks rapidly at the top of a flight.
    const headroom = Math.max(0, this.ceiling - this.height);
    const lift = Math.min(headroom, reduced ? .28 : .78);
    this.velocity = Math.min(Math.sqrt(2 * GRAVITY * headroom),
      Math.max(this.velocity, Math.sqrt(2 * GRAVITY * lift)));
    this.angularVelocity = reduced ? 0 : Math.min(10, this.angularVelocity + 5.5);
  }

  reset() { this.height = this.velocity = this.angularVelocity = this.touches = 0; }

  update(dt: number, reduced = false) {
    this.reduced = reduced;
    if (reduced) this.angularVelocity = 0;
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, .25);
    while (remaining > .000001 && this.airborne) {
      // Solve the exact impact time, so bounces don't change with frame rate.
      const impact = (this.velocity + Math.sqrt(this.velocity ** 2 + 2 * GRAVITY * this.height)) / GRAVITY;
      const step = Math.min(remaining, impact);
      const damping = Math.exp(-SPIN_DAMPING * step);
      this.spin += this.angularVelocity * (1 - damping) / SPIN_DAMPING;
      this.angularVelocity *= damping;
      this.height = Math.max(0, this.height + this.velocity * step - GRAVITY * step * step / 2);
      this.velocity -= GRAVITY * step;
      remaining -= step;
      if (impact <= step + .000001) {
        this.height = 0;
        this.velocity = reduced ? 0 : -this.velocity * .32;
        this.angularVelocity *= .5;
        if (this.velocity < .42) this.reset();
      }
    }
  }
}
