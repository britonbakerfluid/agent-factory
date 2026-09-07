import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import { clearFactorySegment, FACTORY_OBSTACLES, GARAGE_STATIONS, MINI_WORKSTATION_ID, MINI_WORKSTATION_SLOT, MINI_WORKSTATION_USERNAME, MINI_WORK_PACK_MS, WORKSTATIONS, fromFactoryWorld, toFactoryWorld } from '../shared/factory25d-layout';
import { slotPosition } from '../shared/world-layouts';
import type { HookPayload, WorldMovement } from '../shared/types';

function fixture() {
  let now = 1_000;
  const state = new StateManager('factory25d', () => now);
  const hook = (id: string, username = MINI_WORKSTATION_USERNAME): HookPayload => ({ hook_event_name: 'SessionStart', session_id: id, username, ownerId: `${id}-owner`, cwd: '/factory', avatar: DEFAULT_AVATAR });
  const add = (id: string, username = MINI_WORKSTATION_USERNAME) => { const payload = hook(id, username); state.handleHookEvent(payload); return payload; };
  const work = (payload: HookPayload) => state.handleHookEvent({ ...payload, hook_event_name: 'PreToolUse', tool_name: 'Read' });
  return { state, add, work, time: (value: number) => { now = value; }, advance: (value: number) => { now = value; state.advanceWorld(now); } };
}
function expectOpenRoute(movement: WorldMovement) {
  const points = [movement.from, ...(movement.waypoints ?? []), movement.to].map(fromFactoryWorld);
  for (let i = 1; i < points.length; i++) expect(clearFactorySegment(points[i - 1], points[i])).toBe(true);
}

describe('Jonathan Mini laptop workstation', () => {
  it('appends a seventh garage slot and keeps its actual standing point outside every solid prop', () => {
    expect(MINI_WORKSTATION_SLOT).toBe(24);
    expect(WORKSTATIONS.slice(18, 24).map(s => s.id)).toEqual(['garage-0', 'garage-1', 'garage-2', 'garage-3', 'garage-4', 'garage-5']);
    expect(GARAGE_STATIONS).toHaveLength(7);
    expect(WORKSTATIONS[24].id).toBe(MINI_WORKSTATION_ID);
    const point = fromFactoryWorld(slotPosition('factory25d', 'work', MINI_WORKSTATION_SLOT));
    expect(point).toEqual({ x: expect.closeTo(.95), z: expect.closeTo(26.4) });
    expect(FACTORY_OBSTACLES.some(o => point.x > o.left && point.x < o.right && point.z > o.near && point.z < o.far)).toBe(false);
    expect(clearFactorySegment({ x: .95, z: 27.05 }, point)).toBe(true);
  });

  it('allows only the exact username to assign the Mini, and does not invent laptop work for an idle assignment', () => {
    const f = fixture();
    for (const [index, name] of ['jonathan', 'jonathanvergara-other', 'JonathanVergara', 'someone'].entries()) {
      const id = `other-${index}`; f.add(id, name);
      expect(f.state.assignWorkstation(id, MINI_WORKSTATION_SLOT)).toBe(false);
    }
    f.add('jonathan');
    expect(f.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT)).toBe(true);
    expect(f.state.get('jonathan')!.activity).toBe('idle');
    expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
    expect(f.state.getSnapshot().workstationCount).toBe(25);
  });

  it('routes real work from a garage assignment to the laptop and preserves its arrival clock across work hooks', () => {
    const f = fixture(), payload = f.add('jonathan');
    expect(f.state.assignWorkstation('jonathan', 18)).toBe(true);
    f.work(payload);
    const agent = f.state.get('jonathan')!, movement = structuredClone(agent.world.movement!);
    expect(agent.activity).toBe('reading');
    expect(agent.world.slotIndex).toBe(MINI_WORKSTATION_SLOT);
    expect(agent.world.miniWork).toEqual({ startedAt: movement.arrivesAt });
    expectOpenRoute(movement);
    f.time(movement.startedAt + 100);
    f.state.handleHookEvent({ ...payload, hook_event_name: 'PreToolUse', tool_name: 'Write' });
    expect(agent.world.miniWork?.startedAt).toBe(movement.arrivesAt);
    expect(agent.world.movement?.arrivesAt).toBe(movement.arrivesAt);
    f.time(movement.arrivesAt + 5_000);
    f.work(payload);
    expect(agent.world.movement).toBeUndefined();
    expect(agent.world.miniWork?.startedAt).toBe(movement.arrivesAt);
    expect(agent.world.position).toEqual(slotPosition('factory25d', 'work', MINI_WORKSTATION_SLOT));
  });

  it('starts laptop work when a downstairs Mini visitor receives work, but never for idle walking or revving', () => {
    const f = fixture(), payload = f.add('jonathan');
    expect(f.state.requestGarageCarVisit('jonathan-owner', 'jonathan', 'mini').success).toBe(true);
    expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
    const arrival = f.state.get('jonathan')!.world.movement!.arrivesAt;
    f.advance(arrival + 4_000);
    expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
    f.work(payload);
    expect(f.state.get('jonathan')!.world.carVisit).toBeUndefined();
    expect(f.state.get('jonathan')!.world).toMatchObject({ zone: 'work', slotIndex: MINI_WORKSTATION_SLOT, miniWork: { startedAt: expect.any(Number) } });
    expectOpenRoute(f.state.get('jonathan')!.world.movement!);
  });

  it('keeps upstairs Jonathan work upstairs and makes additional downstairs sessions use the regular garage desks', () => {
    const upstairs = fixture(), upstairsHook = upstairs.add('upstairs');
    upstairs.work(upstairsHook);
    expect(upstairs.state.get('upstairs')!.world.slotIndex).not.toBe(MINI_WORKSTATION_SLOT);
    const f = fixture(), one = f.add('one'), two = f.add('two');
    f.state.assignWorkstation('one', 18); f.state.assignWorkstation('two', 19);
    f.work(one); f.work(two);
    expect(f.state.get('one')!.world.slotIndex).toBe(MINI_WORKSTATION_SLOT);
    expect(f.state.get('two')!.world.slotIndex).toBe(19);
    expect(f.state.get('two')!.world.miniWork).toBeUndefined();
    expect(f.state.assignWorkstation('two', MINI_WORKSTATION_SLOT)).toBe(false);
  });

  it('never gives the special slot to general allocation, including when every ordinary desk is occupied', () => {
    const f = fixture();
    for (let i = 0; i < 25; i++) f.work(f.add(`worker-${i}`, `worker-${i}`));
    const agents = f.state.getAll();
    expect(agents.filter(a => a.world.zone === 'work')).toHaveLength(24);
    expect(agents.some(a => a.world.zone === 'work' && a.world.slotIndex === MINI_WORKSTATION_SLOT)).toBe(false);
    expect(agents.at(-1)!.world.zone).toBe('waiting');
  });

  it('blocks Mini rev visits while the laptop is reserved and blocks laptop reservation during a rev visit', () => {
    const f = fixture(), jonathan = f.add('jonathan'); f.add('driver', 'someone');
    f.state.assignWorkstation('jonathan', 18); f.work(jonathan);
    expect(f.state.requestGarageCarVisit('driver-owner', 'driver', 'mini')).toMatchObject({ success: false, error: expect.stringMatching(/occupied/i) });
    expect(f.state.requestGarageCarVisit('driver-owner', 'driver', 'porsche').success).toBe(true);

    const rev = fixture(), waiting = rev.add('jonathan'); rev.add('driver', 'someone');
    rev.state.requestGarageCarVisit('driver-owner', 'driver', 'mini');
    expect(rev.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT)).toBe(false);
    rev.state.assignWorkstation('jonathan', 18); rev.work(waiting);
    expect(rev.state.get('jonathan')!.world.slotIndex).toBe(18);
    expect(rev.state.get('jonathan')!.world.miniWork).toBeUndefined();
  });

  it('clears the laptop immediately on manual control, moving stations, and session end', () => {
    for (const action of ['manual', 'station', 'stopped']) {
      const f = fixture(), payload = f.add(`jonathan-${action}`), id = payload.session_id;
      f.work(payload); f.state.assignWorkstation(id, MINI_WORKSTATION_SLOT);
      expect(f.state.get(id)!.world.miniWork).toBeDefined();
      if (action === 'manual') f.state.setManualControl(id, { ...f.state.get(id)!.world.position, facing: 'down', moving: false });
      if (action === 'station') f.state.assignWorkstation(id, 20);
      if (action === 'stopped') f.state.handleHookEvent({ ...payload, hook_event_name: 'SessionEnd' });
      expect(f.state.get(id)!.world.miniWork).toBeUndefined();
    }
  });

  it('packs for 4500ms before walking away and reserves the Mini through the full pack animation', () => {
    const f = fixture(), payload = f.add('jonathan'); f.add('second'); f.add('driver', 'someone');
    f.work(payload); f.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT);
    f.time(10_000);
    f.state.handleHookEvent({ ...payload, hook_event_name: 'Stop' });
    const agent = f.state.get('jonathan')!, from = { ...agent.world.position }, movement = structuredClone(agent.world.movement!);
    expect(agent.activity).toBe('idle');
    expect(agent.world.miniWork).toEqual({ startedAt: 1_000, packingAt: 10_000 });
    expect(movement.startedAt).toBe(10_000 + MINI_WORK_PACK_MS);
    expect(f.state.assignWorkstation('second', MINI_WORKSTATION_SLOT)).toBe(false);
    expect(f.state.requestGarageCarVisit('driver-owner', 'driver', 'mini').success).toBe(false);
    expect(f.state.requestGarageCarVisit('jonathan-owner', 'jonathan', 'porsche')).toMatchObject({ success: false, error: expect.stringMatching(/laptop/i) });
    f.time(11_000); f.state.updateContext('jonathan', 'still idle');
    expect(agent.world.miniWork?.packingAt).toBe(10_000);
    expect(agent.world.movement).toEqual(movement);
    f.advance(10_000 + MINI_WORK_PACK_MS - 1);
    expect(f.state.getCurrentPosition('jonathan')).toEqual(from);
    expect(agent.world.miniWork).toBeDefined();
    f.advance(10_000 + MINI_WORK_PACK_MS);
    expect(agent.world.miniWork).toBeUndefined();
    expect(f.state.requestGarageCarVisit('driver-owner', 'driver', 'mini').success).toBe(true);
    f.advance(10_000 + MINI_WORK_PACK_MS + 100);
    expect(f.state.getCurrentPosition('jonathan')).not.toEqual(from);
    expectOpenRoute(agent.world.movement!);
  });

  it('does not unpack or reserve again while the agent is grabbed, and resumes real work after release', () => {
    const f = fixture(), payload = f.add('jonathan');
    for (let i = 0; i < 24; i++) f.work(f.add(`desk-${i}`, `desk-${i}`));
    let held = false; f.state.setGrabbedSessionCheck(id => held && id === 'jonathan');
    f.work(payload); f.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT);
    held = true; f.state.cancelGarageCarVisit('jonathan');
    expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
    expect(f.state.get('jonathan')!.world.slotIndex).not.toBe(MINI_WORKSTATION_SLOT);
    f.work(payload); f.advance(2_000);
    expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
    held = false; f.advance(3_000);
    expect(f.state.get('jonathan')!.world).toMatchObject({ zone: 'work', slotIndex: MINI_WORKSTATION_SLOT, miniWork: { startedAt: 3_000 } });
  });

  it('finishes packing before reopening the laptop if work resumes during departure', () => {
    const f = fixture(), payload = f.add('jonathan');
    f.work(payload); f.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT);
    f.time(10_000); f.state.handleHookEvent({ ...payload, hook_event_name: 'Stop' });
    f.time(11_000); f.work(payload);
    expect(f.state.get('jonathan')!.world).toMatchObject({ zone: 'work', slotIndex: MINI_WORKSTATION_SLOT, miniWork: { startedAt: 1_000, packingAt: 10_000 } });
    f.advance(14_500);
    expect(f.state.get('jonathan')!.world.miniWork).toEqual({ startedAt: 14_500 });
  });

  it('cancels without a pack delay when work ends before arrival or before the laptop is retrieved', () => {
    for (const elapsed of [-1, 0, 2_299]) {
      const f = fixture(), payload = f.add('jonathan');
      f.state.assignWorkstation('jonathan', 18); f.work(payload);
      const startedAt = f.state.get('jonathan')!.world.miniWork!.startedAt;
      f.time(startedAt + elapsed); f.state.handleHookEvent({ ...payload, hook_event_name: 'Stop' });
      expect(f.state.get('jonathan')!.world.miniWork).toBeUndefined();
      expect(f.state.get('jonathan')!.world.movement?.startedAt).toBe(startedAt + elapsed);
      expectOpenRoute(f.state.get('jonathan')!.world.movement!);
    }
  });

  it('does not restore another username into the newly reserved slot', () => {
    const f = fixture(), payload = f.add('someone', 'someone'); f.work(payload);
    const snapshot = f.state.getSnapshot();
    snapshot.agents[0].world = { zone: 'work', slotIndex: MINI_WORKSTATION_SLOT, position: toFactoryWorld({ x: .95, z: 26.4 }), facing: 'up', miniWork: { startedAt: 1_000 } };
    const restored = new StateManager('factory25d', () => 5_000); restored.restoreWorld(snapshot);
    expect(restored.get('someone')!.world.slotIndex).not.toBe(MINI_WORKSTATION_SLOT);
    expect(restored.get('someone')!.world.miniWork).toBeUndefined();
  });
});
