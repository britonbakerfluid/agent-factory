import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import type { ContributionRecord } from '../shared/factory-contributions.js';
import type { WorldSnapshot } from '../shared/types.js';

const directories: string[] = [];
const repositories: LibSqlWorldRepository[] = [];
const baseline: ContributionRecord[] = [
  { githubLogin: 'tingeym', mergedPullRequests: 542, checkedAt: 1_000 },
  { githubLogin: 'newcomer', mergedPullRequests: 0, checkedAt: 1_100 },
];

async function database() {
  const directory = await mkdtemp(join(tmpdir(), 'factory-contribution-db-'));
  directories.push(directory);
  const url = `file:${join(directory, 'world.db')}`;
  const repository = new LibSqlWorldRepository({ url, production: false });
  repositories.push(repository);
  await repository.initialize();
  return { repository, url };
}

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('durable contribution history', () => {
  it('initializes empty and retains the latest records across a database restart', async () => {
    const { repository, url } = await database();
    expect(await repository.loadContributionRecords()).toEqual([]);
    await repository.saveContributionRecords(baseline);
    await repository.close();
    const restarted = new LibSqlWorldRepository({ url, production: false });
    repositories.push(restarted);
    await restarted.initialize();
    expect(await restarted.loadContributionRecords()).toEqual(baseline);
    const newer = baseline.map(row => ({ ...row, mergedPullRequests: row.mergedPullRequests + 1, checkedAt: row.checkedAt + 2_000 }));
    await restarted.saveContributionRecords(newer);
    await restarted.saveContributionRecords(baseline);
    await restarted.saveContributionRecords([]);
    expect(await restarted.loadContributionRecords()).toEqual(newer);
    const inspect = createClient({ url });
    try { expect((await inspect.execute('SELECT id FROM contribution_totals')).rows).toEqual([{ id: 1 }]); }
    finally { inspect.close(); }
  });

  it('stores only public validated fields and canonical GitHub logins', async () => {
    const { repository, url } = await database();
    const input = [{ ...baseline[0], githubLogin: 'TINGEYM', token: 'never-store-this', email: 'private@example.test' }] as ContributionRecord[];
    await repository.saveContributionRecords(input);
    expect(await repository.loadContributionRecords()).toEqual([baseline[0]]);
    const inspect = createClient({ url });
    try {
      const stored = String((await inspect.execute('SELECT records FROM contribution_totals WHERE id = 1')).rows[0].records);
      expect(stored).not.toContain('never-store-this');
      expect(stored).not.toContain('private@example.test');
      expect(JSON.parse(stored)).toEqual([baseline[0]]);
    } finally { inspect.close(); }
  });

  it('rejects an invalid snapshot before it can partially replace good data', async () => {
    const { repository } = await database();
    await repository.saveContributionRecords(baseline);
    for (const invalid of [
      [baseline[0], { ...baseline[1], mergedPullRequests: -1, checkedAt: 9_000 }],
      [{ ...baseline[0], checkedAt: 0 }],
      [{ ...baseline[0], checkedAt: 9_000 }, { ...baseline[0], githubLogin: 'TINGEYM', checkedAt: 10_000 }],
    ]) {
      await expect(repository.saveContributionRecords(invalid)).rejects.toThrow('Invalid contribution records');
      expect(await repository.loadContributionRecords()).toEqual(baseline);
    }
  });

  it('rejects corrupt stored JSON and mismatched snapshot metadata without exposing raw content', async () => {
    const { repository, url } = await database();
    await repository.saveContributionRecords(baseline);
    const inspect = createClient({ url });
    try {
      for (const [records, checkedAt] of [
        ['{private-corrupt-content', 1_100],
        [JSON.stringify(baseline), 1_200],
        [JSON.stringify([baseline[0], baseline[0]]), 1_000],
      ] as const) {
        await inspect.execute({ sql: 'UPDATE contribution_totals SET records = ?, checked_at = ? WHERE id = 1', args: [records, checkedAt] });
        await expect(repository.loadContributionRecords()).rejects.toThrow('Invalid stored contribution records');
      }
    } finally { inspect.close(); }
  });

  it('does not overwrite world state, avatars, team presence, or the world revision status', async () => {
    const { repository } = await database();
    const world: WorldSnapshot = { schemaVersion: 1, revision: 7, serverTime: 5_000, environment: 'factory25d', agents: [], tombstones: [], chat: [], events: [] };
    await repository.save(world);
    await repository.saveAvatarProfile('owner', DEFAULT_AVATAR);
    const team = [{ id: 'owner', name: 'Factory Person', avatar: DEFAULT_AVATAR, lastSeen: 5_000 }];
    await repository.saveTeamMembers(team);
    const previousStatus = repository.status();
    await repository.saveContributionRecords(baseline);
    expect(await repository.loadContributionRecords()).toEqual(baseline);
    expect(repository.status()).toEqual(previousStatus);
    expect(await repository.load()).toEqual(world);
    expect(await repository.loadAvatarProfiles()).toEqual([{ ownerId: 'owner', avatar: DEFAULT_AVATAR }]);
    expect(await repository.loadTeamMembers()).toEqual(team);
  });
});
