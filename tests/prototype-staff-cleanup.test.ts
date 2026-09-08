import { describe, expect, it } from 'vitest';
import { clearFactorySegment, FRONT_COUNTER } from '../shared/factory25d-layout';
import { StaffCleanup, type FixtureCleanupJob } from '../client/prototypes/factory25dStaffCleanup';

const home = { x: FRONT_COUNTER.x + .65, z: FRONT_COUNTER.z - .6 };
function job(id: string, x: number, z: number, offsetX: number, offsetZ: number) {
  let pending = true, restored = 0;
  const request: FixtureCleanupJob = { id, label: id, point: { x, z }, standAt: { x: x + offsetX, z: z + offsetZ },
    isPending: () => pending, recover() { restored++; pending = false; } };
  return { request, get restored() { return restored; }, knockAgain() { pending = true; } };
}
const simulate = (clerk: StaffCleanup, seconds: number, onFrame?: () => void) => {
  for (let i = 0; i < seconds * 60; i++) {
    const before = { ...clerk.position }; clerk.update(1 / 60);
    expect(clearFactorySegment(before, clerk.position)).toBe(true);
    onFrame?.();
  }
};

describe('room staff cleanup', () => {
  it('walks around the counter and room walls, restores each fixture once, then returns to the desk', () => {
    const clerk = new StaffCleanup(home);
    const lamps = [job('desk', -3.56, 6.61, 0, -.58), job('floor', 3.25, 7.13, .65, 0), job('candle', 2.25, 7.85, .7, 0)];
    lamps.forEach(lamp => { clerk.enqueue(lamp.request); clerk.enqueue(lamp.request); });
    expect(clerk.queued).toBe(3);
    const order: string[] = [];
    simulate(clerk, 70, () => {
      for (const lamp of lamps) if (lamp.restored && !order.includes(lamp.request.id)) order.push(lamp.request.id);
    });
    expect(order).toEqual(['desk', 'floor', 'candle']);
    expect(lamps.map(lamp => lamp.restored)).toEqual([1, 1, 1]);
    expect(clerk.phase).toBe('idle'); expect(clerk.position).toEqual(home);
  });

  it('waits while the room is hidden, and does not lose a new fall during the lifting animation', () => {
    const clerk = new StaffCleanup(home), lamp = job('desk', -3.56, 6.61, 0, -.58);
    clerk.enqueue(lamp.request); clerk.update(.05, false);
    expect(clerk.position).toEqual(home); expect(lamp.restored).toBe(0);
    let tippedAgain = false;
    simulate(clerk, 10, () => {
      if (lamp.restored === 1 && !tippedAgain) {
        tippedAgain = true; lamp.knockAgain(); clerk.enqueue(lamp.request);
      }
    });
    expect(lamp.restored).toBe(2); expect(clerk.phase).toBe('idle');
  });

  it('skips stale or unreachable props instead of walking through a wall', () => {
    const clerk = new StaffCleanup(home), stale = job('stale', 1, 1, 0, 0), blocked = job('blocked', 0, 8, 0, 0);
    stale.request.recover();
    clerk.enqueue(stale.request); clerk.enqueue(blocked.request);
    simulate(clerk, 1);
    expect(clerk.position).toEqual(home); expect(blocked.restored).toBe(0);
  });
});
