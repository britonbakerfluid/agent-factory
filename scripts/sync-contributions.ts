import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rename } from 'node:fs/promises';
import { CONTRIBUTION_IDENTITIES } from '../shared/factory-contribution-seed.js';
import { CONTRIBUTION_REPOSITORY, CONTRIBUTION_BRANCH, type ContributionRecord } from '../shared/factory-contributions.js';

// Uses the existing GitHub CLI login; only totals and verified account aliases
// reach the generated bundle. This never changes GitHub or the running service.
const run = promisify(execFile);
const records: ContributionRecord[] = [];
try {
  for (const identity of CONTRIBUTION_IDENTITIES) {
    const { stdout } = await run('gh', ['api', '--method', 'GET', 'search/issues', '-f',
      `q=repo:${CONTRIBUTION_REPOSITORY} is:pr is:merged base:${CONTRIBUTION_BRANCH} author:${identity.githubLogin}`, '-f', 'per_page=1',
      '--jq', '{total_count, incomplete_results}'], { timeout: 20_000, maxBuffer: 32_768 });
    const data = JSON.parse(stdout);
    if (data.incomplete_results !== false || !Number.isSafeInteger(data.total_count) || data.total_count < 0) throw new Error('Incomplete total');
    records.push({ githubLogin: identity.githubLogin, mergedPullRequests: data.total_count, checkedAt: Date.now() });
  }
  const path = new URL('../shared/factory-contribution-seed.ts', import.meta.url);
  const temporary = new URL(`../shared/.contribution-seed-${process.pid}.tmp`, import.meta.url);
  const source = `import type { ContributionIdentity, ContributionRecord } from './factory-contributions.js';\n\n// Verified factory aliases and authored PRs merged into fluid/main.\n// Regenerate with npm run sync:contributions; no emails, tokens or task data.\nexport const CONTRIBUTION_IDENTITIES: ContributionIdentity[] = ${JSON.stringify(CONTRIBUTION_IDENTITIES, null, 2)};\nexport const CONTRIBUTION_SEED: ContributionRecord[] = ${JSON.stringify(records, null, 2)};\n`;
  await writeFile(temporary, source); await rename(temporary, path);
  console.log(`Updated verified contribution history for ${records.length} factory members.`);
} catch {
  console.error('Contribution history was not changed. Check GitHub CLI access to fluid-commerce/fluid-mono and try again.');
  process.exitCode = 1;
}
