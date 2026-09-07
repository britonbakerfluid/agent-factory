import type { AgentAttention } from '@shared/types';
import type { FactoryRoom } from '@shared/factory25d-layout';
import type { BoardData } from './factory25dBoardData';
import { agentStateDescription, resolveAgentVisualState } from './factory25dAgentStates';

export interface PersonalAgentAttention {
  sessionId: string;
  task: string;
  kind: AgentAttention['kind'];
  purpose: string;
  since?: number;
}
const kinds = new Set(['input', 'permission', 'ready', 'error']);

/** Only a verified browser principal can identify which agents need this viewer. */
export function personalAgentAttention(data: BoardData): PersonalAgentAttention[] {
  const ownerId = data.principal?.ownerId;
  if (!ownerId || !data.connected) return [];
  return (data.world?.agents ?? []).flatMap(agent => {
    if (agent.ownerId !== ownerId) return [];
    const state = resolveAgentVisualState(agent);
    if (!kinds.has(state)) return [];
    return [{
      sessionId: agent.sessionId,
      task: agent.sessionName?.trim() || agent.taskDescription?.trim()
        || agent.cwd.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || 'Agent task',
      kind: state as AgentAttention['kind'],
      purpose: agentStateDescription(state),
      since: agent.attention?.since,
    }];
  }).sort((a, b) => Number(a.kind === 'ready') - Number(b.kind === 'ready')
    || (a.since ?? 0) - (b.since ?? 0) || a.sessionId.localeCompare(b.sessionId));
}

export function agentAttentionSummary(items: PersonalAgentAttention[]): string {
  const needsYou = items.filter(item => item.kind === 'input' || item.kind === 'permission').length;
  const issues = items.filter(item => item.kind === 'error').length;
  const ready = items.filter(item => item.kind === 'ready').length;
  return [needsYou ? `${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : '',
    issues ? `${issues} ${issues === 1 ? 'issue' : 'issues'}` : '', ready ? `${ready} ready` : ''].filter(Boolean).join(' · ');
}

/** Keep the last connected episodes across a reconnect, without retaining another owner's tasks. */
export class AgentAttentionEpisodes {
  private ownerId?: string;
  private active = new Map<string, string>();

  update(data: BoardData): PersonalAgentAttention[] {
    const ownerId = data.principal?.ownerId;
    // The shared socket clears the principal while reconnecting. Keep only episode
    // identifiers until a verified principal returns, so re-auth never repeats a cue.
    if (!ownerId || !data.connected) return [];
    if (ownerId !== this.ownerId) { this.active.clear(); this.ownerId = ownerId; }
    const items = personalAgentAttention(data), next = new Map<string, string>();
    const fresh = items.filter(item => {
      const episode = `${item.kind}:${item.since ?? 'legacy'}`;
      next.set(item.sessionId, episode);
      return this.active.get(item.sessionId) !== episode;
    });
    this.active = next;
    return fresh;
  }
}

/** Recheck ownership and connection at click time; finding an agent never claims its controls. */
export function findPersonalAttentionAgent(data: BoardData, sessionId: string,
  roomForAgent: (sessionId: string) => FactoryRoom | undefined, visit: (room: FactoryRoom) => void): boolean {
  if (!personalAgentAttention(data).some(item => item.sessionId === sessionId)) return false;
  const room = roomForAgent(sessionId);
  if (!room) return false;
  visit(room);
  return true;
}
