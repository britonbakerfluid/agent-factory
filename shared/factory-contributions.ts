export interface ContributionRecord {
  githubLogin: string;
  mergedPullRequests: number;
  checkedAt: number;
}
export interface ContributionSnapshot {
  repository: string;
  baseBranch: string;
  contributors: ContributionRecord[];
  refresh: 'configured' | 'unconfigured' | 'unavailable';
}
export interface ContributionIdentity { githubLogin: string; factoryUsernames: string[] }
export const CONTRIBUTION_REPOSITORY = 'fluid-commerce/fluid-mono';
export const CONTRIBUTION_BRANCH = 'main';

/** Level 2 needs one merge, level 3 three, level 4 six. No expiry or activity decay. */
export function contributionLevel(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid contribution count');
  const level = Math.floor((1 + Math.sqrt(1 + 8 * count)) / 2);
  const floor = level * (level - 1) / 2, next = level * (level + 1) / 2;
  return { level, earned: count - floor, required: level, remaining: next - count, next };
}

export function readContribution(value: unknown): ContributionRecord | undefined {
  if (!value || typeof value !== 'object') return;
  const record = value as Partial<ContributionRecord>;
  if (typeof record.githubLogin !== 'string' || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(record.githubLogin)
    || !Number.isSafeInteger(record.mergedPullRequests) || record.mergedPullRequests! < 0
    || !Number.isSafeInteger(record.checkedAt) || record.checkedAt! <= 0) return;
  return { githubLogin: record.githubLogin, mergedPullRequests: record.mergedPullRequests!, checkedAt: record.checkedAt! };
}

/** Explicit aliases only: a task title or a similar display name never earns another person's credit. */
export function contributionFor(username: string, identities: readonly ContributionIdentity[], records: readonly ContributionRecord[]) {
  const key = username.trim().toLowerCase();
  const matches = identities.filter(identity => [identity.githubLogin, ...identity.factoryUsernames]
    .some(name => name.toLowerCase() === key));
  if (matches.length !== 1) return;
  return records.find(record => record.githubLogin.toLowerCase() === matches[0].githubLogin.toLowerCase());
}
