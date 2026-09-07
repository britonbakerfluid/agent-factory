import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_VISUAL_STATES, DEFAULT_AGENT_STYLES, AgentPresentationMachine, activityForVisualState,
  agentStateStyle, resetAgentStateStyle, resolveAgentVisualState, sanitizeAgentStateStyle, setAgentStateStyle, stationaryAgentAnimation } from '../client/prototypes/factory25dAgentStates';

afterEach(() => AGENT_VISUAL_STATES.forEach(resetAgentStateStyle));
describe('shared agent presentation states', () => {
  it('faces the scenery only for a quiet break, retaining attention poses when ready or blocked', () => {
    expect(stationaryAgentAnimation('idle', true)).toBe('walk_up');
    for (const state of ['input', 'permission', 'ready', 'error'] as const)
      expect(stationaryAgentAnimation(state, true)).toBe(DEFAULT_AGENT_STYLES[state].pose);
    setAgentStateStyle('ready', { pose: 'sit' });
    expect(stationaryAgentAnimation('ready', true)).toBe('sit');
    expect(stationaryAgentAnimation('writing', false)).toBe('work');
  });
  it('covers every work state, gives it its own look, and does not infer attention from idle or unspecified waiting', () => {
    for (const activity of ['thinking', 'reading', 'writing', 'running', 'searching', 'chatting', 'planning', 'compacting'] as const) {
      expect(resolveAgentVisualState({ activity, currentTool: null })).toBe(activity);
      expect(DEFAULT_AGENT_STYLES[activity].text).toBeTruthy();
    }
    expect(resolveAgentVisualState({ activity: 'idle', currentTool: null })).toBe('idle');
    expect(resolveAgentVisualState({ activity: 'waiting', currentTool: null })).toBe('waiting');
    expect(resolveAgentVisualState({ activity: 'running', currentTool: 'AskUserQuestion' })).toBe('running');
    expect(resolveAgentVisualState({ activity: 'waiting', currentTool: 'AskUserQuestion' })).toBe('input');
    expect(resolveAgentVisualState({ activity: 'waiting', currentTool: 'request_user_input' })).toBe('input');
    expect(resolveAgentVisualState({ activity: 'waiting', currentTool: 'request_user_input_async' })).toBe('waiting');
    expect(resolveAgentVisualState({ activity: 'waiting', currentTool: 'ExitPlanMode' })).toBe('permission');
    expect(DEFAULT_AGENT_STYLES.writing.fps).toBeGreaterThan(DEFAULT_AGENT_STYLES.reading.fps);
  });

  it('transitions immediately on real attention and resumed work, keeping a stable entry time across repeated snapshots', () => {
    const machine = new AgentPresentationMachine();
    const reading = { activity: 'reading' as const, currentTool: 'Read' };
    expect(machine.transition(reading, 10)).toBe('reading');
    expect(machine.transition({ ...reading }, 20)).toBe('reading');
    expect(machine.enteredAt).toBe(10);
    expect(machine.transition({ activity: 'waiting', currentTool: null, attention: { kind: 'permission', since: 25 } }, 30)).toBe('permission');
    expect(machine.transition({ activity: 'waiting', currentTool: null, attention: { kind: 'input', since: 35 } }, 40)).toBe('input');
    expect(machine.enteredAt).toBe(40);
    expect(machine.transition({ activity: 'thinking', currentTool: null }, 50)).toBe('thinking');
    expect(machine.transition({ activity: 'idle', currentTool: null, attention: { kind: 'ready', since: 60 } }, 60)).toBe('ready');
    expect(machine.transition({ activity: 'stopped', currentTool: null, attention: { kind: 'input', since: 35 } }, 70)).toBe('stopped');
  });

  it('tunes a single state without changing other states or the canonical defaults', () => {
    const original = { ...DEFAULT_AGENT_STYLES.writing }, reading = { ...agentStateStyle('reading') };
    setAgentStateStyle('writing', { text: 'putting it together', pose: 'idle', fps: 4, bubble: 'text', color: '#fedcba' });
    expect(agentStateStyle('writing')).toMatchObject({ text: 'putting it together', pose: 'idle', fps: 4, color: '#fedcba' });
    expect(DEFAULT_AGENT_STYLES.writing).toEqual(original); expect(agentStateStyle('reading')).toEqual(reading);
    resetAgentStateStyle('writing'); expect(agentStateStyle('writing')).toEqual(original);
  });

  it('bounds stored/user-entered settings and rejects malformed colors or pose values', () => {
    const fallback = DEFAULT_AGENT_STYLES.reading;
    const result = sanitizeAgentStateStyle({ pose: 'run-script', bubble: 'bad', fps: Infinity, text: ' ', glyph: '123456', color: 'url(bad)' }, fallback);
    expect(result).toEqual({ ...fallback, glyph: '123' });
    expect(sanitizeAgentStateStyle({ fps: -20, text: 'a'.repeat(100) }, fallback)).toMatchObject({ fps: 0, text: 'a'.repeat(32) });
    expect(sanitizeAgentStateStyle({ fps: 900 }, fallback).fps).toBe(10);
    expect(sanitizeAgentStateStyle(null, fallback)).toEqual(fallback);
  });

  it('maps preview evidence to real activities without introducing synthetic server activities', () => {
    expect(activityForVisualState('input')).toBe('waiting'); expect(activityForVisualState('permission')).toBe('waiting');
    expect(activityForVisualState('ready')).toBe('idle'); expect(activityForVisualState('error')).toBe('idle');
    expect(activityForVisualState('writing')).toBe('writing');
  });
});
