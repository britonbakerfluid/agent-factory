import { describe, expect, it } from 'vitest';
import { contributionFor, contributionLevel, readContribution, type ContributionIdentity } from '../shared/factory-contributions';
import { CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED } from '../shared/factory-contribution-seed';

describe('lifetime contribution levels', () => {
  it('advances at triangular boundaries and gives Mike credit for his historical work', () => {
    expect(contributionLevel(0)).toEqual({ level: 1, earned: 0, required: 1, remaining: 1, next: 1 });
    expect(contributionLevel(1)).toEqual({ level: 2, earned: 0, required: 2, remaining: 2, next: 3 });
    expect(contributionLevel(2)).toEqual({ level: 2, earned: 1, required: 2, remaining: 1, next: 3 });
    expect(contributionLevel(3)).toEqual({ level: 3, earned: 0, required: 3, remaining: 3, next: 6 });
    expect(contributionLevel(542)).toEqual({ level: 33, earned: 14, required: 33, remaining: 19, next: 561 });
    const mike = contributionFor('michaeltingey', CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED)!;
    expect(mike.mergedPullRequests).toBe(542);
    expect(contributionLevel(mike.mergedPullRequests).level).toBe(33);
  });

  it('keeps progress within its current level across early and veteran boundaries', () => {
    for (const level of [2, 3, 4, 10, 33, 100, 1000]) {
      const threshold = level * (level - 1) / 2;
      expect(contributionLevel(threshold - 1)).toMatchObject({ level: level - 1, remaining: 1 });
      expect(contributionLevel(threshold)).toMatchObject({ level, earned: 0, required: level });
      expect(contributionLevel(threshold + level - 1)).toMatchObject({ level, earned: level - 1, remaining: 1 });
    }
    for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => contributionLevel(invalid)).toThrow(RangeError);
    }
  });

  it('resolves explicit aliases case-insensitively but never guesses from a name or task title', () => {
    const record = contributionFor('  MICHAELTINGEY  ', CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED);
    expect(record?.githubLogin).toBe('tingeym');
    expect(contributionFor('TINGEYM', CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED)).toEqual(record);
    expect(contributionFor('Briton Baker', CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED)?.githubLogin).toBe('britonbakerfluid');
    for (const unknown of ['Mike Tingey', 'mike', 'Michael Tingey', 'michaeltingey-api-task', 'Fix tingeym checkout', '', 'unknown']) {
      expect(contributionFor(unknown, CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED)).toBeUndefined();
    }
    expect(contributionFor('michaeltingey', CONTRIBUTION_IDENTITIES, [])).toBeUndefined();
  });

  it('withholds a level when an alias ambiguously identifies two accounts', () => {
    const identities: ContributionIdentity[] = [
      { githubLogin: 'one', factoryUsernames: ['Mike'] },
      { githubLogin: 'two', factoryUsernames: ['mike'] },
    ];
    const records = identities.map(({ githubLogin }) => ({ githubLogin, mergedPullRequests: 10, checkedAt: 1000 }));
    expect(contributionFor('Mike', identities, records)).toBeUndefined();
    expect(contributionFor('one', identities, records)?.githubLogin).toBe('one');
  });

  it('accepts verified zero counts and strips fields that are not part of a public record', () => {
    const record = { githubLogin: 'tingeym', mergedPullRequests: 0, checkedAt: 1000 };
    expect(readContribution({ ...record, privateField: 'must not be retained' })).toEqual(record);
    expect(readContribution(record)).not.toBe(record);
    for (const value of [undefined, null, [], 'tingeym', {},
      { ...record, githubLogin: '' }, { ...record, githubLogin: 'mike tingey' },
      { ...record, githubLogin: '<script>' }, { ...record, githubLogin: 'a'.repeat(40) },
      { ...record, mergedPullRequests: -1 }, { ...record, mergedPullRequests: '542' },
      { ...record, mergedPullRequests: 1.5 }, { ...record, mergedPullRequests: Infinity },
      { ...record, mergedPullRequests: Number.MAX_SAFE_INTEGER + 1 },
      { ...record, checkedAt: 0 }, { ...record, checkedAt: -1 },
      { ...record, checkedAt: '1000' }, { ...record, checkedAt: 1.5 },
    ]) expect(readContribution(value)).toBeUndefined();
  });
});
