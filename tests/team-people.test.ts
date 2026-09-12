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

it('combines the confirmed team identities without doubling a shared legacy wallet', () => {
  const rows = PERSON_IDENTITIES.slice(1).flatMap(ids => ids.map(id => member(id,
    id.startsWith('legacy:') ? id.slice(7) : ids[ids.length - 1].slice(7))));
  const balances = [2160, 0, 84, 9897, 364, 141, 71, 1397];
  const keys = [...new Set(rows.map(row => row.id.startsWith('legacy:')
    ? `user:${row.name.toLowerCase()}` : `owner:${row.id}`))];
  const result = teamPeople(rows, { wallets: keys.map((key, i) => ({ key,
    username: 'test', balance: balances[i], remainderMs: 0 })), visits: [] });
  expect(result).toHaveLength(4);
  expect(result.find(row => row.id === PERSON_IDENTITIES[1][0])?.tickets).toBe(2244);
  expect(result.find(row => row.id === PERSON_IDENTITIES[2][0])?.tickets).toBe(10261);
  expect(result.find(row => row.id === PERSON_IDENTITIES[3][0])?.tickets).toBe(212);
  expect(result.find(row => row.id === PERSON_IDENTITIES[4][0])?.tickets).toBe(1397);
});
