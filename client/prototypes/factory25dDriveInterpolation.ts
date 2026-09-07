import type { GarageDriveCar } from '@shared/factory25d-driving';

/** Blend confirmed poses, including yaw across ±pi, without predicting through walls. */
export class GarageDriveInterpolation {
  private frames: { at: number; cars: GarageDriveCar[] }[] = [];
  private receivedAt = 0;
  private lastRenderAt = -Infinity;
  clear() { this.frames = []; this.lastRenderAt = -Infinity; }
  push(cars: GarageDriveCar[], serverTime: number, receivedAt: number) {
    if (!Number.isFinite(serverTime) || this.frames.length && serverTime <= this.frames.at(-1)!.at) return;
    this.frames.push({ at: serverTime, cars: cars.map(car => ({ ...car })) });
    if (this.frames.length > 12) this.frames.shift();
    this.receivedAt = receivedAt;
  }
  sample(now: number): GarageDriveCar[] {
    const newest = this.frames.at(-1); if (!newest) return [];
    const at = Math.max(this.lastRenderAt, Math.min(newest.at, newest.at + Math.max(0, now - this.receivedAt) - 100));
    this.lastRenderAt = at;
    let first = this.frames[0], second = first;
    for (const frame of this.frames) { if (frame.at <= at) first = frame; second = frame; if (frame.at >= at) break; }
    const t = second.at === first.at ? 1 : Math.max(0, Math.min(1, (at - first.at) / (second.at - first.at)));
    return second.cars.map(car => {
      const previous = first.cars.find(item => item.id === car.id);
      if (!previous || Math.hypot(car.x - previous.x, car.z - previous.z) > 3) return { ...car };
      const yawDelta = Math.atan2(Math.sin(car.yaw - previous.yaw), Math.cos(car.yaw - previous.yaw));
      return { ...car, x: previous.x + (car.x - previous.x) * t, z: previous.z + (car.z - previous.z) * t,
        yaw: previous.yaw + yawDelta * t, vx: previous.vx + (car.vx - previous.vx) * t, vz: previous.vz + (car.vz - previous.vz) * t,
        steer: previous.steer + (car.steer - previous.steer) * t,
        hoverHeight: (previous.hoverHeight ?? 0) + ((car.hoverHeight ?? 0) - (previous.hoverHeight ?? 0)) * t };
    });
  }
}
