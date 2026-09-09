import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { normalizeHookPayload } from '../server/hook-payload';
import { agentPickerItems } from '../client/prototypes/factory25dAgentPicker';
import type { HookPayload } from '../shared/types';

function setup() {
  const state = new StateManager('factory25d', () => 1000);
  const send = (session_id: string, cwd: unknown, hook_event_name = 'SessionStart', extra = {}) => {
    state.handleHookEvent(normalizeHookPayload({ session_id, cwd, hook_event_name, username: 'same person', ...extra }) as HookPayload);
  };
  for (const [id, cwd] of [['one', '/work/guardhouse-web'], ['two', '/work/api'], ['three', '/work/mobile']]) {
    const payload = normalizeHookPayload({ session_id: id, cwd, hook_event_name: 'SessionStart', username: 'same person' })!;
    state.handleHookEvent({ ...payload, ownerId: 'same-owner' });
  }
  return { state, send };
}

describe('per-session project directories', () => {
  it('keeps three agents separate across interleaved hooks and a quick resume', () => {
    const { state, send } = setup();
    send('one', '/work/guardhouse-web', 'PreToolUse', { tool_name: 'Read' });
    send('two', '/work/api-v2', 'CwdChanged');
    send('three', '/work/mobile', 'PostToolUse', { tool_name: 'Write' });
    send('one', '/work/guardhouse-web');
    expect(state.getSnapshot().agents.map(a => [a.sessionId, a.cwd])).toEqual([
      ['one', '/work/guardhouse-web'], ['two', '/work/api-v2'], ['three', '/work/mobile'],
    ]);
    const restored = new StateManager('factory25d', () => 1000);
    restored.restoreWorld(state.getSnapshot());
    expect(restored.getSnapshot().agents.map(a => a.cwd)).toEqual(['/work/guardhouse-web', '/work/api-v2', '/work/mobile']);
  });

  it.each([undefined, null, '', 42])('retains a known directory when CwdChanged has no usable path (%s)', cwd => {
    const { state, send } = setup();
    send('two', cwd, 'CwdChanged');
    expect(state.get('two')?.cwd).toBe('/work/api');
    expect(state.get('one')?.cwd).toBe('/work/guardhouse-web');
  });

  it('changes only the renamed project option when directory is the only changed field', () => {
    const { state, send } = setup();
    const before = agentPickerItems(state.getSnapshot().agents);
    send('two', '/work/api-v2', 'CwdChanged');
    const after = agentPickerItems(state.getSnapshot().agents);
    expect(after[1]).toEqual({ value: 'two', label: 'api-v2 · idle' });
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
  });

  it('retains distinct session ids for duplicate labels and preserves explicit names', () => {
    const { state, send } = setup();
    send('two', '/other/guardhouse-web', 'CwdChanged');
    send('three', '/work/mobile', 'UserPromptSubmit', { session_name: 'mobile release' });
    const options = agentPickerItems(state.getSnapshot().agents);
    expect(options[0].label).toBe(options[1].label);
    expect(options[0].value).not.toBe(options[1].value);
    expect(options[2].label).toBe('mobile release · thinking');
  });

  it('refreshes the username fallback when no project or session name exists', () => {
    const agent = { sessionId: 'empty', cwd: '', username: 'before', activity: 'idle' as const };
    expect(agentPickerItems([agent])[0].label).toBe('before · idle');
    expect(agentPickerItems([{ ...agent, username: 'after' }])[0].label).toBe('after · idle');
  });
});
