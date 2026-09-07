import type { AgentActivity, AgentSession } from '@shared/types';

export const AGENT_VISUAL_STATES = ['idle', 'thinking', 'reading', 'writing', 'running', 'searching', 'chatting', 'planning', 'compacting', 'waiting', 'input', 'permission', 'ready', 'error', 'stopped'] as const;
export type AgentVisualState = typeof AGENT_VISUAL_STATES[number];
export type AgentStateStyle = { pose: 'idle' | 'work' | 'sit'; fps: number; bubble: 'icon' | 'text' | 'hidden'; glyph: string; text: string; color: string };
const style = (pose: AgentStateStyle['pose'], fps: number, glyph: string, text: string, color = '#b5dfd0', bubble: AgentStateStyle['bubble'] = 'icon'): AgentStateStyle => ({ pose, fps, glyph, text, color, bubble });
export const DEFAULT_AGENT_STYLES: Readonly<Record<AgentVisualState, AgentStateStyle>> = {
  idle: style('sit', 1, '', 'taking a break', '#a9bbc5', 'hidden'),
  thinking: style('idle', 2, '···', 'thinking', '#c3d6e2'),
  reading: style('work', 2, '▤', 'reading files'),
  writing: style('work', 7, '✎', 'writing code'),
  running: style('work', 3, '›_', 'running a command'),
  searching: style('work', 4, '⌕', 'searching'),
  chatting: style('work', 4, '··', 'working with agents'),
  planning: style('idle', 2, '≡', 'making a plan', '#d8c5ea'),
  compacting: style('idle', 1, '↻', 'organizing context', '#d8c5ea'),
  waiting: style('idle', 1, '?', 'waiting', '#f7dfa3'),
  input: style('idle', 1, '?', 'needs your input', '#f7dfa3', 'text'),
  permission: style('idle', 1, '?', 'needs approval', '#f7dfa3', 'text'),
  ready: style('idle', 1, '✓', 'ready for review', '#c7e6b6', 'text'),
  error: style('idle', 1, '!', 'hit a problem', '#ffcabd', 'text'),
  stopped: style('idle', 0, '', 'session ended', '#a9bbc5', 'hidden'),
};

type ActivitySource = Pick<AgentSession, 'activity' | 'currentTool'> & { attention?: { kind: 'input' | 'permission' | 'ready' | 'error'; since: number } };
/** Activity and attention are authoritative; movement and emotes remain separate pose overrides. */
export function resolveAgentVisualState(agent: ActivitySource, waitingFor?: 'input' | 'permission'): AgentVisualState {
  if (agent.activity === 'stopped') return 'stopped';
  if (agent.attention) return agent.attention.kind;
  if (agent.activity === 'waiting') {
    if (waitingFor) return waitingFor;
    if (agent.currentTool === 'AskUserQuestion' || agent.currentTool === 'request_user_input') return 'input';
    if (agent.currentTool === 'ExitPlanMode') return 'permission';
  }
  return AGENT_VISUAL_STATES.includes(agent.activity) ? agent.activity : 'idle';
}

export class AgentPresentationMachine {
  state: AgentVisualState = 'idle';
  enteredAt = 0;
  transition(agent: ActivitySource, now: number, waitingFor?: 'input' | 'permission') {
    const next = resolveAgentVisualState(agent, waitingFor);
    if (next !== this.state) { this.state = next; this.enteredAt = now; }
    return this.state;
  }
}

const storageKey = 'factory.agent-styles.v1';
const overrides: Partial<Record<AgentVisualState, AgentStateStyle>> = {};
export function sanitizeAgentStateStyle(value: unknown, fallback: AgentStateStyle): AgentStateStyle {
  const raw = value && typeof value === 'object' ? value as Partial<AgentStateStyle> : {};
  return {
    pose: ['idle', 'work', 'sit'].includes(raw.pose ?? '') ? raw.pose! : fallback.pose,
    fps: typeof raw.fps === 'number' && Number.isFinite(raw.fps) ? Math.max(0, Math.min(10, raw.fps)) : fallback.fps,
    bubble: ['icon', 'text', 'hidden'].includes(raw.bubble ?? '') ? raw.bubble! : fallback.bubble,
    glyph: typeof raw.glyph === 'string' ? [...raw.glyph].slice(0, 3).join('') : fallback.glyph,
    text: typeof raw.text === 'string' && raw.text.trim() ? raw.text.trim().slice(0, 32) : fallback.text,
    color: typeof raw.color === 'string' && /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : fallback.color,
  };
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
  for (const id of AGENT_VISUAL_STATES) if (saved?.[id]) overrides[id] = sanitizeAgentStateStyle(saved[id], DEFAULT_AGENT_STYLES[id]);
} catch { /* Missing or unavailable storage uses the shared defaults. */ }
export function agentStateStyle(id: AgentVisualState): AgentStateStyle { return overrides[id] ?? DEFAULT_AGENT_STYLES[id]; }
export function setAgentStateStyle(id: AgentVisualState, patch: Partial<AgentStateStyle>) {
  overrides[id] = sanitizeAgentStateStyle({ ...agentStateStyle(id), ...patch }, DEFAULT_AGENT_STYLES[id]);
  try { localStorage.setItem(storageKey, JSON.stringify(overrides)); } catch { /* Keep this preview usable without storage. */ }
}
export function resetAgentStateStyle(id: AgentVisualState) {
  delete overrides[id];
  try { localStorage.setItem(storageKey, JSON.stringify(overrides)); } catch { /* In-memory reset still applies. */ }
}
export function agentStateDescription(id: AgentVisualState, tool?: string | null) {
  const labels: Record<AgentVisualState, string> = {
    idle: 'Taking a break', thinking: 'Thinking', reading: 'Reading', writing: 'Writing', running: 'Running', searching: 'Searching',
    chatting: 'Working with agents', planning: 'Planning', compacting: 'Compacting context', waiting: 'Waiting for permission or input',
    input: 'Waiting for your input', permission: 'Waiting for permission', ready: 'Turn finished · ready for review', error: 'An error was reported', stopped: 'Session ended',
  };
  return [labels[id], ['reading', 'writing', 'running', 'searching', 'chatting'].includes(id) ? tool : null].filter(Boolean).join(' · ');
}
export function activityForVisualState(id: AgentVisualState): AgentActivity {
  return id === 'input' || id === 'permission' ? 'waiting' : id === 'ready' || id === 'error' ? 'idle' : id;
}
