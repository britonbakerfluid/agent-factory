import { describe, expect, it, vi } from 'vitest';
import { AgentAttentionEpisodes, agentAttentionSummary, findPersonalAttentionAgent, personalAgentAttention } from '../client/prototypes/factory25dAgentAttention';
import type { BoardData } from '../client/prototypes/factory25dBoardData';
import type { WorldAgent } from '../shared/types';
import { DEFAULT_AVATAR } from '../shared/constants';

function agent(patch: Partial<WorldAgent> = {}): WorldAgent {
  return {
    sessionId: 'mine', username: 'same-name', ownerId: 'owner-1', sessionName: 'Garage polish', cwd: '/code/factory',
    activity: 'waiting', attention: { kind: 'input', since: 100 }, currentTool: 'AskUserQuestion',
    avatar: DEFAULT_AVATAR, subagents: [], startedAt: 1, lastEventAt: 100,
    world: { zone: 'work', slotIndex: 0, position: { x: 100, y: 100 } }, ...patch,
  };
}
function data(agents: WorldAgent[], patch: Partial<BoardData> = {}): BoardData {
  return { agents: [], connected: true, merges: null, principal: { ownerId: 'owner-1', username: 'same-name' },
    world: { schemaVersion: 1, revision: 1, serverTime: 100, environment: 'factory25d', agents, tombstones: [], chat: [], events: [] }, ...patch };
}

describe('personal agent attention', () => {
  it('requires verified exact ownership and does not infer it from a matching name', () => {
    const list = [agent(), agent({ sessionId: 'other', ownerId: 'owner-2' }), agent({ sessionId: 'unknown', ownerId: undefined })];
    expect(personalAgentAttention(data(list)).map(item => item.sessionId)).toEqual(['mine']);
    expect(personalAgentAttention(data(list, { principal: undefined }))).toEqual([]);
    expect(personalAgentAttention(data(list, { principal: { ownerId: '', username: 'same-name' } }))).toEqual([]);
    expect(personalAgentAttention(data(list, { principal: { ownerId: 'owner-2', username: 'different-name' } })).map(item => item.sessionId)).toEqual(['other']);
  });

  it('distinguishes input, permission, issues and completed turns without claiming errors or ready need input', () => {
    const items = personalAgentAttention(data([
      agent({ sessionId: 'ready', activity: 'idle', attention: { kind: 'ready', since: 90 } }),
      agent(), agent({ sessionId: 'approval', attention: { kind: 'permission', since: 101 } }),
      agent({ sessionId: 'error', activity: 'idle', attention: { kind: 'error', since: 102 } }),
    ]));
    expect(items.map(item => item.kind)).toEqual(['input', 'permission', 'error', 'ready']);
    expect(items.map(item => item.purpose)).toEqual(['Waiting for your input', 'Waiting for permission', 'An error was reported', 'Turn finished · ready for review']);
    expect(agentAttentionSummary(items)).toBe('2 need you · 1 issue · 1 ready');
    expect(agentAttentionSummary(items.filter(item => item.kind === 'ready'))).toBe('1 ready');
    const issues = items.filter(item => item.kind === 'error');
    expect(agentAttentionSummary(issues)).toBe('1 issue');
    expect(agentAttentionSummary([...issues, ...issues])).toBe('2 issues');
    expect(agentAttentionSummary(items.slice(0, 1))).toBe('1 needs you');
    expect(agentAttentionSummary([])).toBe('');
  });

  it('supports exact older-host question and approval tools but never infers alerts from generic waiting or idle', () => {
    const list = [
      agent({ sessionId: 'question', attention: undefined }),
      agent({ sessionId: 'plan', attention: undefined, currentTool: 'ExitPlanMode' }),
      ...['idle', 'thinking', 'waiting', 'stopped'].map((activity, index) => agent({ sessionId: `quiet-${index}`, activity: activity as WorldAgent['activity'], attention: undefined, currentTool: null })),
      agent({ sessionId: 'not-exact', attention: undefined, currentTool: 'SomeAskUserQuestionTool' }),
      agent({ sessionId: 'ended', activity: 'stopped' }),
    ];
    expect(personalAgentAttention(data(list)).map(item => [item.sessionId, item.kind])).toEqual([['plan', 'permission'], ['question', 'input']]);
  });

  it('suppresses offline snapshots and clears attention when work resumes or a session disappears', () => {
    const needsInput = data([agent()]);
    expect(agentAttentionSummary(personalAgentAttention(needsInput))).toBe('1 needs you');
    expect(agentAttentionSummary(personalAgentAttention({ ...needsInput, connected: false }))).toBe('');
    expect(agentAttentionSummary(personalAgentAttention(data([agent({ activity: 'writing', attention: undefined, currentTool: 'Edit' })])))).toBe('');
    expect(personalAgentAttention(data([agent()], { connected: false }))).toEqual([]);
    expect(personalAgentAttention(data([agent({ activity: 'writing', attention: undefined, currentTool: 'Edit' })]))).toEqual([]);
    expect(personalAgentAttention(data([]))).toEqual([]);
  });

  it('uses the real task name and safe descriptive fallbacks', () => {
    expect(personalAgentAttention(data([agent()]))[0].task).toBe('Garage polish');
    expect(personalAgentAttention(data([agent({ sessionName: ' ', taskDescription: 'Finish the windows' })]))[0].task).toBe('Finish the windows');
    expect(personalAgentAttention(data([agent({ sessionName: '', cwd: 'C:\\work\\factory' })]))[0].task).toBe('factory');
    expect(personalAgentAttention(data([agent({ sessionName: '', cwd: '' })]))[0].task).toBe('Agent task');
  });

  it('announces each uninterrupted episode once, including through reconnect and transient loss of principal', () => {
    const episodes = new AgentAttentionEpisodes(), live = data([agent()]);
    expect(episodes.update(live)).toHaveLength(1);
    expect(episodes.update(live)).toEqual([]);
    expect(episodes.update(data([agent({ lastEventAt: 200, taskDescription: 'Changed details' })]))).toEqual([]);
    expect(episodes.update({ ...live, connected: false, principal: undefined })).toEqual([]);
    expect(episodes.update({ ...live, principal: undefined })).toEqual([]);
    expect(episodes.update(live)).toEqual([]);
    expect(episodes.update(data([agent({ attention: { kind: 'input', since: 300 } })]))).toHaveLength(1);
    expect(episodes.update(data([agent({ activity: 'idle', attention: { kind: 'ready', since: 301 } })]))[0].kind).toBe('ready');
  });

  it('detects a new legacy episode after work resumes and clears vanished sessions', () => {
    const episodes = new AgentAttentionEpisodes(), waiting = data([agent({ attention: undefined })]);
    expect(episodes.update(waiting)).toHaveLength(1);
    expect(episodes.update(data([agent({ attention: undefined, lastEventAt: 201 })]))).toEqual([]);
    episodes.update(data([agent({ activity: 'writing', attention: undefined, currentTool: 'Edit' })]));
    expect(episodes.update(waiting)).toHaveLength(1);
    episodes.update(data([]));
    expect(episodes.update(waiting)).toHaveLength(1);
  });

  it('never announces another owner’s tasks and resets episode identity for a verified owner change', () => {
    const episodes = new AgentAttentionEpisodes();
    expect(episodes.update(data([agent()]))).toHaveLength(1);
    expect(episodes.update(data([agent()], { principal: { ownerId: 'owner-2', username: 'same-name' } }))).toEqual([]);
    expect(episodes.update(data([agent({ ownerId: 'owner-2' })], { principal: { ownerId: 'owner-2', username: 'same-name' } }))).toHaveLength(1);
    expect(episodes.update(data([agent({ ownerId: 'owner-2' })], { principal: undefined }))).toEqual([]);
  });

  it('finds attention agents in their current room without claiming controls and rejects stale clicks', () => {
    const visit = vi.fn();
    for (const room of ['factory', 'patio', 'garage'] as const) {
      expect(findPersonalAttentionAgent(data([agent()]), 'mine', () => room, visit)).toBe(true);
      expect(visit).toHaveBeenLastCalledWith(room);
    }
    visit.mockClear();
    const room = vi.fn(() => 'garage' as const);
    expect(findPersonalAttentionAgent(data([agent()], { connected: false }), 'mine', room, visit)).toBe(false);
    expect(findPersonalAttentionAgent(data([agent()], { principal: undefined }), 'mine', room, visit)).toBe(false);
    expect(findPersonalAttentionAgent(data([agent({ ownerId: 'owner-2' })]), 'mine', room, visit)).toBe(false);
    expect(findPersonalAttentionAgent(data([]), 'mine', room, visit)).toBe(false);
    expect(findPersonalAttentionAgent(data([agent({ activity: 'writing', attention: undefined })]), 'mine', room, visit)).toBe(false);
    expect(room).not.toHaveBeenCalled();
    expect(findPersonalAttentionAgent(data([agent()]), 'mine', () => undefined, visit)).toBe(false);
    expect(visit).not.toHaveBeenCalled();
  });
});
