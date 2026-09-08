import { describe, expect, it } from 'vitest';
import { createDrivingPreview } from '../client/prototypes/factory25dDrivingPreview';
import { GARAGE_CAR_BAYS, GARAGE_CAR_YAW } from '../shared/factory25d-garage';
import type { GarageDriveState } from '../shared/factory25d-driving';

describe('local garage driving playground', () => {
  it('returns shared pedestrian nudges for local rendering and retains the private car lease', () => {
    let frame: GarageDriveState | undefined;
    const preview = createDrivingPreview(message => { if (message.type === 'garage_drive_state') frame = message; });
    preview.send({ type: 'garage_drive', action: 'claim', car: 'mini' });
    preview.send({ type: 'garage_drive', action: 'input', car: 'mini', input: { throttle: -1, steer: 0, drift: false } });
    const pedestrian = { sessionId: 'local-walker', pushable: true, x: GARAGE_CAR_BAYS.mini.x - Math.sin(GARAGE_CAR_YAW) * 4, z: GARAGE_CAR_BAYS.mini.z - Math.cos(GARAGE_CAR_YAW) * 4 };
    const origin = { ...pedestrian };
    let count = 0;
    for (let i = 0; i < 110; i++) for (const push of preview.update(1 / 60, i * 1000 / 60, [pedestrian])) {
      count++; expect(push.sessionId).toBe(pedestrian.sessionId);
      expect(Math.hypot(push.x - push.fromX, push.z - push.fromZ)).toBeLessThan(.2);
      Object.assign(pedestrian, { x: push.x, z: push.z });
    }
    expect(count).toBeGreaterThan(5);
    expect(Math.hypot(pedestrian.x - origin.x, pedestrian.z - origin.z)).toBeGreaterThan(.5);
    expect(frame?.cars.find(car => car.id === 'mini')).toMatchObject({ mode: 'driving', driverVisitorId: 'local-driving-preview', damage: 0 });
  });
});
