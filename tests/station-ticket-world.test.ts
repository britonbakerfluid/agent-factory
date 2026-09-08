import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../server/state';
import { TICKET_COLLECT_MS } from '../server/station-tickets';
import { STALE_SESSION_TIMEOUT_MS } from '../shared/constants';
import { WORKSTATIONS } from '../shared/factory25d-layout';
import { ticketBalance } from '../shared/station-tickets';
import { WorldStore } from '../client/state/WorldStore';
import { parseWorldSnapshot } from '../server/persistence/world-repository';
import type { HookPayload, WorldDelta } from '../shared/types';

const hook = (sessionId: string, event = 'SessionStart', username = 'alice'): HookPayload => ({
  hook_event_name: event, session_id: sessionId, username, ownerId: `account-${username}`, cwd: `/work/${sessionId}`,
  avatar: { spriteIndex: 0, color: '#fff', hat: null, trail: null }, tool_name: 'Read',
});
function setup() {
  let now = 1_000;
  const state = new StateManager('factory25d', () => now);
  const deltas: WorldDelta[] = [];
  state.onStateChange(event => { if (event.type === 'delta') deltas.push(event.delta); });
  state.handleHookEvent(hook('one'));
  state.handleHookEvent(hook('one', 'PreToolUse'));
  state.assignWorkstation('one', 0);
  return { state, deltas, at: (time: number) => { now = time; }, tick: (time: number) => { now = time; state.advanceWorld(now); } };
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('station ticket world lifecycle', () => {
  it.each([
    ['Stop', 'idle', 'ready'], ['Elicitation', 'waiting', 'input'], ['PermissionRequest', 'waiting', 'permission'],
  ] as const)('%s after60s publishes attention immediately, collects before departure, and reserves the machine', (event, activity, attention) => {
    const { state, at, tick, deltas } = setup();
    at(61_000); state.handleHookEvent(hook('one', event));
    const agent = state.get('one')!, payout = agent.ticketPayout!;
    expect(agent).toMatchObject({ activity, attention: { kind: attention, since: 61_000 }, world: { zone: 'work', slotIndex: 0 } });
    expect(agent.world.movement).toBeUndefined();
    expect(payout).toMatchObject({ count: 1, startedAt: 61_000, collectAt: 61_000 + TICKET_COLLECT_MS });
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
    expect(deltas.at(-1)?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'station_tickets' }),
      expect.objectContaining({ kind: 'agent_upsert', agent: expect.objectContaining({ activity, attention: { kind: attention, since: 61_000 } }) }),
    ]));
    state.handleHookEvent(hook('two', 'SessionStart', 'bob'));
    expect(state.assignWorkstation('two', 0)).toBe(false);
    tick(payout.collectAt - 1);
    expect(state.get('one')?.world.zone).toBe('work');
    expect(state.get('one')?.world.movement).toBeUndefined();
    tick(payout.collectAt);
    expect(state.get('one')?.world.zone).toBe(activity === 'idle' ? 'idle' : 'waiting');
    expect(state.get('one')?.world.movement?.startedAt).toBe(payout.collectAt);
    expect(state.assignWorkstation('two', 0)).toBe(true);
    tick(payout.collectAt + 60_000);
    expect(state.getSnapshot().stationTickets?.wallets[0].balance).toBe(1);
  });

  it('keeps waiting attention after a following Stop hook and does not earn more while awaiting input', () => {
    const { state, at, tick } = setup();
    at(61_000); state.handleHookEvent(hook('one', 'Elicitation'));
    at(61_500); state.handleHookEvent(hook('one', 'Stop'));
    expect(state.get('one')).toMatchObject({ activity: 'waiting', attention: { kind: 'input', since: 61_000 } });
    tick(130_000);
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('does not credit travel to a station', () => {
    let now = 1_000; const state = new StateManager('factory25d', () => now);
    state.handleHookEvent(hook('one')); state.handleHookEvent(hook('one', 'PreToolUse'));
    const arrival = state.get('one')!.world.movement!.arrivesAt;
    now = arrival - 1; state.advanceWorld(now);
    expect(state.getSnapshot().stationTickets?.visits).toEqual([]);
    now = arrival + 60_000; state.handleHookEvent(hook('one', 'Stop'));
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('does not mistake a pedestrian paused for a car for arrival at their workstation', () => {
    let now = 1_000; const state = new StateManager('factory25d', () => now);
    state.handleHookEvent(hook('one')); state.handleHookEvent(hook('one', 'PreToolUse'));
    expect(state.get('one')?.world.movement).toBeDefined();
    state.setGarageDrivingHooks({ occupied: () => false, blocks: () => true });
    state.yieldToGarageCars(now);
    expect(state.get('one')?.world.movement).toBeUndefined();
    now = 91_000; state.advanceWorld(now);
    expect(state.getSnapshot().stationTickets).toEqual({ wallets: [], visits: [] });
  });

  it('does not award workstation time while the agent is held as a garage driver', () => {
    const { state, at, tick } = setup();
    at(31_000); state.holdGarageDriver('one');
    tick(151_000);
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 0, remainderMs: 30_000 });
    expect(state.getSnapshot().stationTickets?.visits).toEqual([]);
  });

  it.each(['manual', 'grabbed', 'error'] as const)('does not reward %s state after previously active work', mode => {
    const { state, at, tick } = setup();
    at(31_000);
    if (mode === 'manual') state.setManualControl('one', { x: 400, y: 500, facing: 'up', moving: false });
    if (mode === 'grabbed') { state.setGrabbedSessionCheck(id => id === 'one'); state.advanceWorld(31_000); }
    if (mode === 'error') state.handleHookEvent(hook('one', 'PostToolUseFailure'));
    tick(151_000);
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 0, remainderMs: 30_000 });
    expect(state.getSnapshot().stationTickets?.visits).toEqual([]);
  });

  it('carries remainder across sessions and does not repay a repeated Stop or browser snapshot', () => {
    const { state, at } = setup();
    at(31_000); state.handleHookEvent(hook('one', 'Stop'));
    state.handleHookEvent(hook('two')); state.handleHookEvent(hook('two', 'PreToolUse'));
    const slot = WORKSTATIONS.findIndex(station => station.id === 'inside-1');
    expect(state.assignWorkstation('two', slot)).toBe(true);
    at(61_000); state.handleHookEvent(hook('two', 'Stop'));
    const saved = state.getSnapshot().stationTickets;
    expect(saved?.wallets).toEqual([expect.objectContaining({ key: 'owner:account-alice', balance: 1, remainderMs: 0 })]);
    state.handleHookEvent(hook('two', 'Stop')); state.getSnapshot(); state.getSnapshot();
    expect(state.getSnapshot().stationTickets).toEqual(saved);
  });

  it('persists unfinished work across restart without rewarding offline time', () => {
    const { state, tick } = setup(); tick(41_000);
    const saved = state.getSnapshot();
    expect(saved.stationTickets?.visits[0].activeMs).toBe(40_000);
    let now = 1_000_000; const restored = new StateManager('factory25d', () => now);
    restored.restoreWorld(saved);
    expect(restored.getSnapshot().stationTickets?.wallets[0]?.balance ?? 0).toBe(0);
    restored.handleHookEvent(hook('one', 'PreToolUse'));
    restored.assignWorkstation('one', 0);
    now += 20_000; restored.handleHookEvent(hook('one', 'Stop'));
    expect(restored.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
    const snapshot = restored.getSnapshot();
    const restartedAgain = new StateManager('factory25d', () => now + 20_000); restartedAgain.restoreWorld(snapshot);
    restartedAgain.advanceWorld(now + 20_000);
    expect(restartedAgain.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('reconnect SessionStart cannot duplicate completed earnings', () => {
    const { state, at, tick } = setup();
    at(61_000); state.handleHookEvent(hook('one', 'Stop'));
    tick(65_000); state.handleHookEvent(hook('one'));
    tick(180_000);
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('does not lose active time when an appearance-only update commits the agent', () => {
    const { state, at } = setup();
    at(31_000);
    state.updateOwnerAvatar('account-alice', { spriteIndex: 1, color: '#abc', hat: null, trail: null });
    at(61_000); state.handleHookEvent(hook('one', 'Stop'));
    expect(state.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('registry liveness cannot renew expired active-work credit without another work hook', () => {
    const { state, at, tick } = setup();
    state.setSessionAliveCheck(() => true);
    tick(361_000);
    const earned = state.getSnapshot().stationTickets?.wallets[0].balance;
    expect(earned).toBe(5);
    at(STALE_SESSION_TIMEOUT_MS + 2_000);
    expect(state.reapStale()).toEqual([]);
    tick(STALE_SESSION_TIMEOUT_MS + 3_000);
    tick(STALE_SESSION_TIMEOUT_MS + 64_000);
    at(STALE_SESSION_TIMEOUT_MS + 64_000); state.handleHookEvent(hook('one', 'Stop'));
    expect(state.getSnapshot().stationTickets?.wallets[0].balance).toBe(earned);
  });

  it('preserves expired hook evidence across a JSON restart after registry liveness touches the session', () => {
    const { state, at, tick } = setup();
    state.setSessionAliveCheck(() => true); tick(361_000);
    at(STALE_SESSION_TIMEOUT_MS + 2_000); state.reapStale();
    const persisted = parseWorldSnapshot(JSON.stringify(state.getSnapshot()));
    expect(persisted.agents[0].lastEventAt).toBe(STALE_SESSION_TIMEOUT_MS + 2_000);
    expect(persisted.agents[0].ticketHookAt).toBe(1_000);
    let now = STALE_SESSION_TIMEOUT_MS + 5_000;
    const restored = new StateManager('factory25d', () => now); restored.restoreWorld(persisted);
    now += 90_000; restored.advanceWorld(now); restored.handleHookEvent(hook('one', 'Stop'));
    expect(restored.getSnapshot().stationTickets?.wallets[0]).toMatchObject({ balance: 5, remainderMs: 0 });
  });

  it('delivers balances through deltas and serialized snapshots even after every agent has left', () => {
    const { state, at, tick, deltas } = setup();
    const viewer = new WorldStore(); viewer.replace(state.getSnapshot());
    const fromDelta = deltas.length;
    at(61_000); state.handleHookEvent(hook('one', 'Stop')); tick(65_000);
    at(STALE_SESSION_TIMEOUT_MS + 65_001); expect(state.reapStale()).toEqual(['one']);
    for (const delta of deltas.slice(fromDelta)) expect(viewer.apply(JSON.parse(JSON.stringify(delta)))).toBe('applied');
    expect(viewer.snapshot?.agents).toEqual([]);
    expect(ticketBalance(viewer.snapshot?.stationTickets, { username: 'alice', ownerId: 'account-alice' })).toBe(1);
    expect(ticketBalance(viewer.snapshot?.stationTickets, { username: 'alice', ownerId: 'different-account' })).toBe(0);
    const lastDelta = deltas.at(-1)!;
    expect(viewer.apply(lastDelta)).toBe('stale');
    const persisted = parseWorldSnapshot(JSON.stringify(state.getSnapshot()));
    const nextTab = new WorldStore(); nextTab.replace(persisted);
    expect(nextTab.snapshot?.agents).toEqual([]);
    expect(nextTab.snapshot?.stationTickets).toEqual(viewer.snapshot?.stationTickets);
    const restarted = new StateManager('factory25d', () => persisted.serverTime + 10_000);
    restarted.restoreWorld(persisted);
    expect(restarted.getSnapshot().stationTickets).toEqual(persisted.stationTickets);
    const detached = nextTab.snapshot!; detached.stationTickets!.wallets[0].balance = 999;
    expect(ticketBalance(nextTab.snapshot?.stationTickets, { username: 'alice', ownerId: 'account-alice' })).toBe(1);
  });
});
