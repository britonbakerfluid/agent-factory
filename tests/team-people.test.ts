import { describe, it, expect } from 'vitest';
import { teamPeople, PERSON_IDENTITIES } from '../shared/team-people';
import { DEFAULT_AVATAR } from '../shared/constants';
const member = (id: string, name = 'Briton Baker', online = false, agents = 0) => ({ id, name, online, agents, lastSeen: 10, avatar: DEFAULT_AVATAR });
describe('person totals', () => {
  it('combines confirmed identities, presence, agents and all wallets exactly once', () => {
    const [current, old, legacy] = PERSON_IDENTITIES[0];
    const rows = [member(current, 'briton', true, 2), member(old, 'Briton Baker', false, 3), member(legacy)];
    const result = teamPeople([...rows, rows[0]], { wallets: [
      { key: `owner:${old}`, username: 'Briton Baker', balance: 1147, remainderMs: 0 },
      { key: 'user:briton baker', username: 'Briton Baker', balance: 43, remainderMs: 0 },
    ], visits: [] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'briton', online: true, agents: 5, tickets: 1190 });
    expect(result[0].aliases).toEqual(['briton', 'Briton Baker']);
  });
  it('does not merge unrelated owners with identical names', () => {
    expect(teamPeople([member('other-one'), member('other-two')])).toHaveLength(2);
  });
  it('counts confirmed historical wallets even without old roster rows', () => {
    expect(teamPeople([member(PERSON_IDENTITIES[0][0])], { wallets: [
      { key: 'user:briton baker', username: 'Briton Baker', balance: 43, remainderMs: 0 },
    ], visits: [] })[0].tickets).toBe(43);
  });
});
