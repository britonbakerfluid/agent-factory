import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateManager } from '../server/state';
import { normalizeHookPayload } from '../server/hook-payload';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository';
import { DEFAULT_AVATAR, RESUME_RESPAWN_THRESHOLD_MS, STALE_SESSION_TIMEOUT_MS } from '../shared/constants';
import type { AgentAttention, HookPayload, WorldSnapshot } from '../shared/types';

afterEach(() => { vi.useRealTimers(); });

function fixture() {
  let now = 10_000;
  const state = new StateManager('factory25d', () => now);
  const hook = (name: string, fields: Partial<HookPayload> = {}) => state.handleHookEvent({
    hook_event_name: name, session_id: 'agent', username: 'Ada', ownerId: 'owner',
    cwd: '/fixture', avatar: DEFAULT_AVATAR, ...fields,
  });
  hook('SessionStart');
  return { state, hook, advance: (ms: number) => { now += ms; }, now: () => now };
}

describe('authoritative agent attention', () => {
  it.each([
    ['PermissionRequest', undefined, 'permission'],
    ['PreToolUse', 'AskUserQuestion', 'input'],
    ['PreToolUse', 'request_user_input', 'input'],
    ['PreToolUse', 'ExitPlanMode', 'permission'],
    ['Elicitation', undefined, 'input'],
  ] as const)('records %s %s without turning an unanswered request into ready', (event, tool, kind) => {
    const f = fixture();
    expect(f.state.get('agent')?.attention).toBeUndefined();
    f.hook(event, { tool_name: tool });
    expect(f.state.get('agent')).toMatchObject({ activity: 'waiting', attention: { kind, since: 10_000 } });
    f.advance(1000);
    f.hook(event, { tool_name: tool });
    f.hook('Stop');
    expect(f.state.getSnapshot().agents[0]).toMatchObject({ activity: 'waiting', attention: { kind, since: 10_000 } });
  });

  it('clears plan approval on successful tool completion, then reports the completed turn separately', () => {
    const f = fixture();
    f.hook('PreToolUse', { tool_name: 'ExitPlanMode' });
    f.hook('PostToolUse', { tool_name: 'ExitPlanMode' });
    expect(f.state.get('agent')?.activity).toBe('thinking');
    expect(f.state.get('agent')?.attention).toBeUndefined();
    f.advance(1000);
    f.hook('Stop');
    expect(f.state.get('agent')).toMatchObject({ activity: 'idle', attention: { kind: 'ready', since: 11_000 } });
    f.advance(1000);
    f.hook('Stop');
    expect(f.state.get('agent')?.attention?.since).toBe(11_000);
  });

  it.each([
    ['UserPromptSubmit', undefined], ['PreToolUse', 'Read'], ['PostToolUse', 'AskUserQuestion'], ['PostToolUse', 'request_user_input'],
    ['ElicitationResult', undefined], ['PreCompact', undefined], ['PostCompact', undefined],
  ] as const)('clears attention when %s provides evidence of resumed work', (event, tool) => {
    const f = fixture();
    f.hook('Elicitation');
    f.hook(event, { tool_name: tool });
    expect(f.state.get('agent')?.attention).toBeUndefined();
    expect(f.state.get('agent')?.activity).not.toBe('waiting');
  });

  it('preserves explicit errors through non-work events and clears them on recovery', () => {
    const f = fixture();
    f.hook('PreToolUse', { tool_name: 'Bash' });
    f.hook('PostToolUseFailure', { tool_name: 'Bash' });
    expect(f.state.get('agent')).toMatchObject({ activity: 'thinking', attention: { kind: 'error', since: 10_000 } });
    f.advance(1000);
    f.hook('Notification', { message: 'notice' });
    f.hook('SubagentStop');
    expect(f.state.get('agent')?.attention).toEqual({ kind: 'error', since: 10_000 });
    f.hook('PostToolUse', { tool_name: 'Bash' });
    expect(f.state.get('agent')?.attention).toBeUndefined();
    f.hook('StopFailure');
    expect(f.state.get('agent')).toMatchObject({ activity: 'idle', attention: { kind: 'error', since: 11_000 } });
    f.hook('UserPromptSubmit');
    expect(f.state.get('agent')?.attention).toBeUndefined();
  });

  it('uses canonical Codex hook names for editing and shell work without guessing input requests', () => {
    const f = fixture();
    f.hook('PreToolUse', { tool_name: 'apply_patch' });
    expect(f.state.get('agent')?.activity).toBe('writing');
    f.hook('PreToolUse', { tool_name: 'Bash' });
    expect(f.state.get('agent')?.activity).toBe('running');
    for (const tool of ['request_user_input_async', 'functions.request_user_input', 'mcp__codex_app__request_user_input_async', 'mcp__other__request_user_input', 'custom_request_user_input_helper']) {
      f.hook('PreToolUse', { tool_name: tool });
      expect(f.state.get('agent')?.activity).not.toBe('waiting');
      expect(f.state.get('agent')?.attention).toBeUndefined();
    }
  });

  it.each(['input', 'permission', 'ready', 'error'] as const)('retains %s evidence through short and long session reconnects', kind => {
    const f = fixture();
    f.hook({ input: 'Elicitation', permission: 'PermissionRequest', ready: 'Stop', error: 'StopFailure' }[kind]);
    f.advance(1000);
    f.hook('SessionStart');
    expect(f.state.get('agent')?.attention).toEqual({ kind, since: 10_000 });
    f.advance(RESUME_RESPAWN_THRESHOLD_MS + 1);
    f.hook('SessionStart');
    expect(f.state.get('agent')?.attention).toEqual({ kind, since: 10_000 });
    expect(f.state.get('agent')?.activity).toBe(kind === 'input' || kind === 'permission' ? 'waiting' : 'idle');
  });

  it('does not infer input or completion from elapsed time, unknown waiting, or generic notifications', () => {
    const f = fixture();
    f.advance(20_000);
    f.state.advanceWorld();
    f.hook('Notification', { message: 'Ready for your input' });
    expect(f.state.get('agent')?.attention).toBeUndefined();
    // An older producer's waiting activity alone does not identify who or what it awaits.
    f.state.get('agent')!.activity = 'waiting';
    f.hook('Stop');
    expect(f.state.get('agent')?.attention).toBeUndefined();
  });

  it('routes child work to that child while the parent remains waiting for its own answer', () => {
    const f = fixture();
    f.hook('SubagentStart', { agent_id: 'child', agent_type: 'research' });
    f.hook('SubagentStart', { agent_id: 'sibling', agent_type: 'review' });
    f.hook('PreToolUse', { tool_name: 'request_user_input' });
    const parent = f.state.get('agent')!;
    const identity = { username: parent.username, cwd: parent.cwd, avatar: parent.avatar };
    const world = structuredClone(parent.world);
    const effects: string[] = [];
    f.state.onStateChange(change => { if (change.type === 'effect') effects.push(change.effect); });
    f.advance(500);

    const childHook = (name: string, tool_name?: string) => f.hook(name, {
      agent_id: 'child', agent_type: 'research', tool_name,
      username: 'must not replace parent', cwd: '/child/worktree',
    });
    childHook('PreToolUse', 'apply_patch');
    expect(parent.subagents.find(child => child.agentId === 'child')?.activity).toBe('writing');
    expect(parent.subagents.find(child => child.agentId === 'sibling')?.activity).toBe('thinking');
    childHook('PostToolUse', 'apply_patch');
    expect(parent.subagents.find(child => child.agentId === 'child')?.activity).toBe('thinking');
    childHook('Stop');
    expect(parent.subagents.find(child => child.agentId === 'child')?.activity).toBe('idle');
    childHook('PermissionRequest', 'Bash');
    expect(parent.subagents.find(child => child.agentId === 'child')?.activity).toBe('waiting');
    childHook('PostToolUseFailure', 'Bash');
    expect(parent.subagents.find(child => child.agentId === 'child')?.activity).toBe('thinking');
    expect(parent).toMatchObject({ ...identity, activity: 'waiting', currentTool: 'request_user_input', toolUseCount: 1, attention: { kind: 'input', since: 10_000 } });
    expect(parent.world).toEqual(world);
    expect(effects).toEqual([]);
    f.hook('SubagentStop', { agent_id: 'child' });
    expect(parent.attention).toEqual({ kind: 'input', since: 10_000 });
    expect(parent.subagents.map(child => child.agentId)).toEqual(['sibling']);
  });

  it('cannot create parent attention from child requests, failures, or completion', () => {
    const f = fixture();
    f.hook('SubagentStart', { agent_id: 'child' });
    for (const event of ['PermissionRequest', 'Elicitation', 'PostToolUseFailure', 'StopFailure', 'Stop']) {
      f.hook(event, { agent_id: 'child', tool_name: 'Bash' });
      expect(f.state.get('agent')?.attention).toBeUndefined();
      expect(f.state.get('agent')?.activity).toBe('idle');
    }
  });

  it('ignores unknown tagged child hooks without mutating or creating a parent', () => {
    const f = fixture();
    f.hook('PermissionRequest');
    const before = f.state.getSnapshot();
    f.advance(1000);
    for (const event of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit', 'SessionEnd', 'Notification']) {
      f.hook(event, { agent_id: 'unknown', tool_name: 'Read' });
      f.hook(event, { session_id: 'unknown-parent', agent_id: 'unknown', tool_name: 'Read' });
    }
    expect(f.state.getSnapshot().agents).toEqual(before.agents);
    expect(f.state.getSnapshot().revision).toBe(before.revision);
    expect(f.state.get('unknown-parent')).toBeUndefined();
  });

  it('clears stopped sessions and removes stale sessions without generating attention', () => {
    vi.useFakeTimers();
    const f = fixture();
    f.hook('PermissionRequest');
    f.hook('SessionEnd');
    expect(f.state.get('agent')?.attention).toBeUndefined();
    f.hook('SessionStart');
    expect(f.state.get('agent')?.attention).toBeUndefined();
    f.hook('Elicitation');
    f.advance(STALE_SESSION_TIMEOUT_MS + 1);
    expect(f.state.reapStale()).toEqual(['agent']);
    expect(f.state.getSnapshot().agents).toEqual([]);
  });

  it.each(['factory25d', 'arcade'] as const)('scrubs contradictory or malformed restored attention in %s', environment => {
    const f = fixture();
    for (const [activity, attention] of [
      ['reading', { kind: 'input', since: 10_000 }], ['reading', { kind: 'permission', since: 10_000 }],
      ['reading', { kind: 'ready', since: 10_000 }], ['reading', { kind: 'error', since: 10_000 }],
      ['waiting', { kind: 'unexpected', since: 10_000 }], ['waiting', { kind: 'input', since: -1 }],
      ['waiting', { kind: 'input', since: 20_000 }], ['waiting', { kind: 'input', since: 'bad' }],
      ['waiting', null],
    ] as const) {
      const saved = f.state.getSnapshot();
      saved.agents[0].activity = activity;
      saved.agents[0].attention = attention as AgentAttention;
      const restored = new StateManager(environment, f.now);
      restored.restoreWorld(saved);
      expect(restored.get('agent')?.attention).toBeUndefined();
    }
    const old = f.state.getSnapshot();
    delete old.agents[0].attention;
    const restored = new StateManager(environment, f.now);
    restored.restoreWorld(old);
    expect(restored.get('agent')?.attention).toBeUndefined();
  });

  it('round-trips each attention state through the database and a fresh viewer snapshot', async () => {
    const f = fixture();
    for (const [kind, event] of Object.entries({ input: 'Elicitation', permission: 'PermissionRequest', ready: 'Stop', error: 'StopFailure' })) {
      f.hook('SessionStart', { session_id: kind });
      f.hook(event, { session_id: kind });
    }
    const directory = mkdtempSync(join(tmpdir(), 'factory-attention-'));
    const options = { url: `file:${join(directory, 'world.db')}`, production: false };
    const write = new LibSqlWorldRepository(options), read = new LibSqlWorldRepository(options);
    try {
      await write.initialize();
      await write.save(f.state.getSnapshot());
      await write.close();
      await read.initialize();
      const saved = await read.load() as WorldSnapshot;
      const restored = new StateManager('factory25d', f.now);
      restored.restoreWorld(saved);
      for (const kind of ['input', 'permission', 'ready', 'error']) {
        expect(restored.getSnapshot().agents.find(agent => agent.sessionId === kind)?.attention).toEqual({ kind, since: 10_000 });
      }
      restored.handleHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'input', cwd: '/fixture', username: 'Ada', avatar: DEFAULT_AVATAR });
      expect(restored.get('input')?.attention).toBeUndefined();
    } finally {
      await write.close();
      await read.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses existing event and tool fields without forwarding questions, plans, outputs, or caller-supplied attention', () => {
    const f = fixture();
    const normalized = normalizeHookPayload({
      session_id: 'agent', hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion',
      tool_input: { questions: ['private question'], plan: 'private plan' },
      tool_response: { output: 'private output' }, prompt: 'private prompt',
      attention: { kind: 'permission', since: 0 },
    })!;
    f.state.handleHookEvent(normalized);
    expect(f.state.get('agent')?.attention).toEqual({ kind: 'input', since: 10_000 });
    const serialized = JSON.stringify({ normalized, snapshot: f.state.getSnapshot() });
    expect(serialized).not.toContain('private');
    expect(normalized.attention).toBeUndefined();
  });
});
