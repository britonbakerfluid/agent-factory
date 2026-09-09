import type { WorldAgent } from '@shared/types';

type PickerAgent = Pick<WorldAgent, 'sessionId' | 'sessionName' | 'cwd' | 'username' | 'activity'>;

/** Cache the rendered options themselves so directory-only changes are visible. */
export function agentPickerItems(agents: readonly PickerAgent[]) {
  return agents.map(agent => ({
    value: agent.sessionId,
    label: `${agent.sessionName || agent.cwd.split('/').filter(Boolean).at(-1) || agent.username} · ${agent.activity}`,
  }));
}
