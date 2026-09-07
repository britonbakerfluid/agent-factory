import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import { GARAGE_CAR_IDS, GARAGE_CAR_VISIT_MS, garageCarLookout } from '../shared/factory25d-garage';
import { clearFactorySegment, factoryElevatorTripAt, fromFactoryWorld, toFactoryWorld } from '../shared/factory25d-layout';
import { slotPosition } from '../shared/world-layouts';
import type { EnvironmentType, WorldMovement } from '../shared/types';

function fixture(environment: EnvironmentType = 'factory25d') {
  let now = 1_000;
  const state = new StateManager(environment, () => now);
  const hook = { hook_event_name: 'SessionStart', session_id: 'driver', username: 'same-visible-name', ownerId: 'owner-a', cwd: '/factory', avatar: DEFAULT_AVATAR };
  state.handleHookEvent(hook);
  return { state, hook, agent: () => state.get(hook.session_id)!, time: (value: number) => { now = value; },
    advance: (value: number) => { now = value; state.advanceWorld(now); } };
}
function expectOpenRoute(movement: WorldMovement) {
  const points = [movement.from, ...(movement.waypoints ?? []), movement.to].map(fromFactoryWorld);
  for (let i = 1; i < points.length; i++) expect(clearFactorySegment(points[i - 1], points[i])).toBe(true);
}

describe('parked-car visits', () => {
  it('requires authenticated exact ownership, a valid car, and the factory environment without changing the agent on rejection', () => {
    const f = fixture(), original = structuredClone(f.agent());
    expect(f.state.requestGarageCarVisit(undefined, 'driver', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/connect/i) });
    expect(f.state.requestGarageCarVisit('owner-b', 'driver', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/own/i) });
    expect(f.state.requestGarageCarVisit('same-visible-name', 'driver', 'mini').success).toBe(false);
    expect(f.state.requestGarageCarVisit('owner-a', 'missing', 'mini').success).toBe(false);
    for (const invalid of ['truck', '__proto__', {}, null, 1]) expect(f.state.requestGarageCarVisit('owner-a', 'driver', invalid).success).toBe(false);
    expect(f.agent()).toEqual(original);
    const arcade = fixture('arcade');
    expect(arcade.state.requestGarageCarVisit('owner-a', 'driver', 'mini').success).toBe(false);
    expect(arcade.state.getSnapshot().garageCars).toBeUndefined();
    expect(f.state.getSnapshot().garageCars).toBe(true);
  });

  it('rejects busy or manually controlled agents without taking over their work or control', () => {
    const f = fixture();
    f.state.handleHookEvent({ ...f.hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    const working = structuredClone(f.agent());
    expect(f.state.requestGarageCarVisit('owner-a', 'driver', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/busy/i) });
    expect(f.agent()).toEqual(working);
    const manual = fixture();
    manual.state.setManualControl('driver', { x: 280, y: 480, facing: 'left', moving: false });
    const controlled = structuredClone(manual.agent());
    expect(manual.state.requestGarageCarVisit('owner-a', 'driver', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/release/i) });
    expect(manual.agent()).toEqual(controlled);
  });

  it.each(GARAGE_CAR_IDS)('routes to %s, preserves the idle slot, dwells for 12 seconds from scheduled arrival, and returns home', car => {
    const f = fixture(), slot = f.agent().world.slotIndex;
    expect(f.state.requestGarageCarVisit('owner-a', 'driver', car)).toEqual({ success: true });
    const movement = structuredClone(f.agent().world.movement!);
    expectOpenRoute(movement);
    expect(movement.to).toEqual(toFactoryWorld(garageCarLookout(car)));
    expect(f.agent().world.slotIndex).toBe(slot);
    expect(f.agent().world.carVisit).toEqual({ car, startedAt: movement.arrivesAt });
    f.time(movement.startedAt + 100);
    f.state.updateContext('driver', 'ordinary idle update');
    expect(f.agent().world.movement).toEqual(movement);
    f.advance(movement.arrivesAt + 700); // A late server tick must not extend the animation.
    expect(f.agent().world.position).toEqual(movement.to);
    expect(f.agent().world.movement).toBeUndefined();
    f.advance(movement.arrivesAt + GARAGE_CAR_VISIT_MS - 1);
    expect(f.agent().world.carVisit?.car).toBe(car);
    f.advance(movement.arrivesAt + GARAGE_CAR_VISIT_MS);
    expect(f.agent().world.carVisit).toBeUndefined();
    expect(f.agent().world.movement?.to).toEqual(slotPosition('factory25d', 'idle', slot!));
    expectOpenRoute(f.agent().world.movement!);
  });

  it('reserves a car on approach, rejects duplicate visits, and releases the reservation when interrupted', () => {
    const f = fixture();
    f.state.handleHookEvent({ ...f.hook, session_id: 'second', ownerId: 'owner-b' });
    expect(f.state.requestGarageCarVisit('owner-a', 'driver', 'mini').success).toBe(true);
    expect(f.state.requestGarageCarVisit('owner-a', 'driver', 'porsche')).toMatchObject({ success: false, error: expect.stringMatching(/already/i) });
    expect(f.state.requestGarageCarVisit('owner-b', 'second', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/occupied/i) });
    f.state.cancelGarageCarVisit('driver'); // Called only after an accepted server grab.
    expect(f.agent().world.carVisit).toBeUndefined();
    expectOpenRoute(f.agent().world.movement!);
    expect(f.state.requestGarageCarVisit('owner-b', 'second', 'mini').success).toBe(true);
  });

  it('cancels cleanly when work resumes inside the lift, manual control starts, or the server restarts', () => {
    const f = fixture();
    f.state.requestGarageCarVisit('owner-a', 'driver', 'mini');
    const movement = f.agent().world.movement!;
    let duringLift = movement.startedAt;
    for (let t = movement.startedAt; t < movement.arrivesAt; t += 50) {
      const lift = factoryElevatorTripAt(movement, t);
      if (lift && lift.progress > .4 && lift.progress < .6) { duringLift = t; break; }
    }
    expect(duringLift).toBeGreaterThan(movement.startedAt);
    f.time(duringLift);
    f.state.handleHookEvent({ ...f.hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    expect(f.agent().world.carVisit).toBeUndefined();
    expect(f.agent().world.zone).toBe('work');
    expectOpenRoute(f.agent().world.movement!);

    const manual = fixture();
    manual.state.requestGarageCarVisit('owner-a', 'driver', 'f1');
    manual.advance(manual.agent().world.movement!.arrivesAt);
    manual.state.setManualControl('driver', { ...manual.agent().world.position, facing: 'left', moving: false });
    expect(manual.agent().world.carVisit).toBeUndefined();

    const restart = fixture();
    restart.state.requestGarageCarVisit('owner-a', 'driver', 'porsche');
    restart.advance(restart.agent().world.movement!.arrivesAt + 4_000);
    const restored = new StateManager('factory25d', () => restart.agent().world.carVisit!.startedAt + 5_000);
    restored.restoreWorld(restart.state.getSnapshot());
    expect(restored.get('driver')!.world.carVisit).toBeUndefined();
    expectOpenRoute(restored.get('driver')!.world.movement!);
  });

  it('does not retain a finished seat reservation after a delayed world tick', () => {
    const f = fixture();
    f.state.requestGarageCarVisit('owner-a', 'driver', 'delorean');
    f.advance(f.agent().world.movement!.arrivesAt + GARAGE_CAR_VISIT_MS + 5_000);
    expect(f.agent().world.carVisit).toBeUndefined();
    expect(f.agent().world.movement?.to).toEqual(slotPosition('factory25d', 'idle', f.agent().world.slotIndex!));
  });
});
