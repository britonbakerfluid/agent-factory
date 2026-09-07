import type { VendingCanBody } from './factory25dVendingPhysics';

export interface VendingSounds {
  select?: () => void;
  dispense?: () => void;
  land?: (energy: number) => void;
  stop?: () => void;
}

/** Selection, actual queue emission and first contact are separate events.
 * Settled bodies never repeat a clunk when their supporting stack wakes up. */
export class VendingSoundEvents {
  private sounds: VendingSounds = {};
  private emitted = new Set<number>();
  private landed = new Set<number>();
  private fallSpeed = new Map<number, number>();
  private wasVisible = false;

  configure(sounds: VendingSounds = {}) { this.sounds.stop?.(); this.sounds = sounds; }
  select(accepted: boolean, visible: boolean) { if (accepted && visible) this.sounds.select?.(); }
  remove(id: number) { this.emitted.delete(id); this.landed.delete(id); this.fallSpeed.delete(id); }
  update(bodies: readonly VendingCanBody[], visible: boolean) {
    if (!visible) {
      if (this.wasVisible) this.sounds.stop?.();
      this.wasVisible = false;
      return;
    }
    this.wasVisible = true;
    for (const body of bodies) {
      if (!this.emitted.has(body.id)) { this.emitted.add(body.id); this.sounds.dispense?.(); }
      if (this.landed.has(body.id)) continue;
      const peak = Math.max(this.fallSpeed.get(body.id) ?? 0, -body.velocity.y);
      this.fallSpeed.set(body.id, peak);
      if (body.supported) {
        this.landed.add(body.id); this.fallSpeed.delete(body.id);
        this.sounds.land?.(Math.max(.22, Math.min(1, peak / 1.8)));
      }
    }
  }
  dispose() { this.sounds.stop?.(); this.emitted.clear(); this.landed.clear(); this.fallSpeed.clear(); }
}
