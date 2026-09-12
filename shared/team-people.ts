import type { TeamMember } from './team.js';
import type { StationTicketState } from './types.js';
import { ticketOwnerKey } from './station-tickets.js';

// Confirmed by Briton: these installations and the legacy entry are one person.
// Presentation only. Never use this mapping to grant access or transfer wallets.
export const PERSON_IDENTITIES: readonly (readonly string[])[] = [[
  'FGApEbY5j36CGIdrEvuUZ1DoBn03cPKgnQmWvRnHqnQ',
  '-YLfLtcXdYhWy2bwJsBJQofxZ5E-gzqi7b6oQyVEpZs',
  'legacy:Briton Baker',
]];
export interface TeamPerson extends TeamMember { aliases: string[]; tickets: number }

/** Only explicit identities are combined; matching display names are not proof. */
export function teamPeople(members: readonly TeamMember[], tickets?: StationTicketState): TeamPerson[] {
  const groups = new Map<string, TeamMember[]>();
  for (const member of members) {
    const id = PERSON_IDENTITIES.find(ids => ids.includes(member.id))?.[0] ?? member.id;
    const group = groups.get(id) ?? [];
    if (!group.some(item => item.id === member.id)) group.push(member);
    groups.set(id, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    group.sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
    const keys = new Set(group.map(member => ticketOwnerKey({
      ownerId: member.id.startsWith('legacy:') ? undefined : member.id, username: member.name,
    })));
    // Include every confirmed wallet even if an old roster entry is absent.
    for (const alias of PERSON_IDENTITIES.find(ids => ids[0] === id) ?? []) {
      keys.add(alias.startsWith('legacy:') ? `user:${alias.slice(7).toLowerCase()}` : `owner:${alias}`);
    }
    return { ...group[0], id, aliases: [...new Set(group.map(member => member.name))],
      online: group.some(member => member.online), lastSeen: Math.max(...group.map(member => member.lastSeen)),
      agents: group.reduce((sum, member) => sum + member.agents, 0),
      tickets: (tickets?.wallets ?? []).filter(wallet => keys.has(wallet.key)).reduce((sum, wallet) => sum + wallet.balance, 0),
    };
  }).sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen || a.name.localeCompare(b.name));
}
