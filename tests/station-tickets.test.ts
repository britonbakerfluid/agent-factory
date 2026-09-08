import { describe, expect, it } from 'vitest';
import { StationTickets, TICKET_ACTIVE_MS, TICKET_COLLECT_MS, TICKET_HOOK_GRACE_MS, ticketOwnerKey } from '../server/station-tickets';
import type { WorldAgent } from '../shared/types';

function worker(overrides: Partial<WorldAgent> = {}): WorldAgent {
  return { sessionId: 'work-1', ownerId: 'account-alice', username: 'alice', activity: 'thinking',
    avatar: { spriteIndex: 0, color: '#fff', hat: null, trail: null }, cwd: '/work', currentTool: null,
    subagents: [], startedAt: 1_000, lastEventAt: 1_000,
    world: { zone: 'work', slotIndex: 0, position: { x: 100, y: 100 }, facing: 'up' }, ...overrides };
}
const wallet = (ledger: StationTickets) => ledger.snapshot().wallets[0];

describe('station ticket accounting', () => {
  it('credits only the settled part of an arrival interval and pays whole active minutes', () => {
    const ledger = new StationTickets(), agent = worker();
    agent.world.movement = { from: { x: 0, y: 0 }, to: agent.world.position, startedAt: 1_000, arrivesAt: 11_000 };
    ledger.track(agent, 1_000);
    expect(ledger.observe(agent, 10_999)).toBeUndefined();
    expect(ledger.snapshot().visits).toEqual([]);
    ledger.observe(agent, 41_000);
    expect(ledger.snapshot().visits[0].activeMs).toBe(30_000);
    agent.activity = 'idle'; agent.attention = { kind: 'ready', since: 81_000 };
    const payout = ledger.observe(agent, 81_000);
    expect(payout).toMatchObject({ count: 1, startedAt: 81_000, collectAt: 81_000 + TICKET_COLLECT_MS, slotIndex: 0 });
    expect(wallet(ledger)).toMatchObject({ balance: 1, remainderMs: 10_000 });
    expect(ledger.collect(agent.sessionId, 81_000)).toBeUndefined();
    expect(ledger.observe(agent, 141_000)).toBeUndefined();
    expect(wallet(ledger)).toMatchObject({ balance: 1, remainderMs: 10_000 });
  });

  it.each(['idle', 'waiting', 'stopped'] as const)('does not reward %s time even at a machine', activity => {
    const ledger = new StationTickets(), agent = worker({ activity });
    ledger.track(agent, 1_000); ledger.observe(agent, 181_000);
    expect(ledger.snapshot()).toEqual({ visits: [], wallets: [] });
  });

  it.each(['manual', 'grabbed', 'error', 'outside-work-zone'] as const)('excludes %s time and retains work already earned', mode => {
    const ledger = new StationTickets(), agent = worker();
    ledger.track(agent, 1_000); ledger.observe(agent, 31_000);
    if (mode === 'manual') agent.manualControl = { x: 100, y: 100, facing: 'up', moving: false };
    if (mode === 'error') agent.attention = { kind: 'error', since: 31_000 };
    if (mode === 'outside-work-zone') agent.world.zone = 'waiting';
    ledger.observe(agent, 31_000, mode === 'grabbed');
    ledger.observe(agent, 181_000, mode === 'grabbed');
    expect(ledger.snapshot().visits).toEqual([]);
    expect(wallet(ledger)).toMatchObject({ balance: 0, remainderMs: 30_000 });
  });

  it('shares fractional minutes across stations and concurrent sessions of one authenticated owner', () => {
    const ledger = new StationTickets(), first = worker(), second = worker({ sessionId: 'work-2', username: 'Alice Renamed' });
    ledger.track(first, 1_000); ledger.track(second, 1_000);
    first.activity = second.activity = 'idle';
    expect(ledger.observe(first, 31_000)).toBeUndefined();
    expect(ledger.observe(second, 31_000)).toMatchObject({ count: 1 });
    expect(ledger.snapshot().wallets).toHaveLength(1);
    expect(wallet(ledger)).toMatchObject({ key: 'owner:account-alice', balance: 1, remainderMs: 0 });
    first.activity = 'writing'; first.world.slotIndex = 1; first.lastEventAt = 61_000;
    ledger.track(first, 61_000); first.activity = 'idle'; ledger.observe(first, 81_000);
    first.activity = 'reading'; first.world.slotIndex = 2;
    ledger.track(first, 81_000); first.activity = 'idle'; ledger.observe(first, 121_000);
    expect(wallet(ledger)).toMatchObject({ balance: 2, remainderMs: 0 });
  });

  it('bounds missing Stop hooks, ignores duplicate observations, and does not add time without a fresh hook', () => {
    const ledger = new StationTickets(), agent = worker();
    ledger.track(agent, 1_000);
    ledger.observe(agent, 1_000 + TICKET_HOOK_GRACE_MS + 60_000);
    expect(wallet(ledger)).toMatchObject({ balance: TICKET_HOOK_GRACE_MS / TICKET_ACTIVE_MS, remainderMs: 0 });
    const snapshot = ledger.snapshot();
    ledger.observe(agent, 1_000 + TICKET_HOOK_GRACE_MS + 60_000);
    ledger.observe(agent, 1_000 + TICKET_HOOK_GRACE_MS * 20);
    expect(ledger.snapshot()).toEqual(snapshot);
  });

  it('restores unfinished active minutes without accruing server downtime or repeating an already consumed visit', () => {
    const ledger = new StationTickets(), agent = worker();
    ledger.track(agent, 1_000); ledger.observe(agent, 41_000);
    const saved = ledger.snapshot(), restored = new StationTickets();
    restored.restore(saved);
    agent.lastEventAt = 1_000_000;
    restored.track(agent, 1_000_000);
    agent.activity = 'idle';
    expect(restored.observe(agent, 1_020_000)).toMatchObject({ count: 1 });
    expect(wallet(restored)).toMatchObject({ balance: 1, remainderMs: 0 });
    expect(saved.visits[0].activeMs).toBe(40_000);
    const restartedAgain = new StationTickets(); restartedAgain.restore(restored.snapshot());
    expect(restartedAgain.forget(agent.sessionId, 2_000_000)).toBeUndefined();
    expect(wallet(restartedAgain)).toMatchObject({ balance: 1, remainderMs: 0 });
  });

  it('settles orphaned visits once and keeps authenticated identities separate from name fallbacks', () => {
    const ledger = new StationTickets(), agent = worker();
    ledger.track(agent, 1_000); ledger.observe(agent, 66_000);
    expect(ledger.forget(agent.sessionId, 70_000)).toMatchObject({ count: 1 });
    expect(ledger.forget(agent.sessionId, 70_000)).toBeUndefined();
    expect(wallet(ledger)).toMatchObject({ balance: 1, remainderMs: 5_000 });
    expect(ticketOwnerKey({ username: 'ALICE' })).toBe('user:alice');
    expect(ticketOwnerKey({ username: 'alice', ownerId: 'account-alice' })).toBe('owner:account-alice');
  });
});
