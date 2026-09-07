import { CONTRIBUTION_IDENTITIES, CONTRIBUTION_SEED } from '@shared/factory-contribution-seed';
import { contributionFor, readContribution, CONTRIBUTION_REPOSITORY, CONTRIBUTION_BRANCH, type ContributionRecord } from '@shared/factory-contributions';
import { factoryHost, isControlPreview } from './factory25dBoardData';

/** One small roster request, shared by every nameplate. Never send private-repo credentials to a browser. */
export function watchContributions(changed: () => void) {
  let records = CONTRIBUTION_SEED.map(record => ({ ...record })), stopped = false;
  let request: AbortController | undefined;
  const refresh = async () => {
    if (stopped || document.hidden || request) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch('/api/contributions', { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (stopped || data.repository !== CONTRIBUTION_REPOSITORY || data.baseBranch !== CONTRIBUTION_BRANCH || !Array.isArray(data.contributors)) return;
      const candidates: ContributionRecord[] = data.contributors.map(readContribution).filter((value: ContributionRecord | undefined): value is ContributionRecord => !!value);
      let updated = false;
      for (const identity of CONTRIBUTION_IDENTITIES) {
        const matches = candidates.filter(record => record.githubLogin.toLowerCase() === identity.githubLogin.toLowerCase());
        if (matches.length !== 1) continue;
        const record = matches[0], index = records.findIndex(old => old.githubLogin.toLowerCase() === record.githubLogin.toLowerCase());
        if (index >= 0 && records[index].checkedAt >= record.checkedAt) continue;
        if (index < 0) records.push(record); else records[index] = record;
        updated = true;
      }
      if (updated) changed();
    } catch { /* Keep the last verified total; unavailable never means level one. */ }
    finally { clearTimeout(timeout); if (request === controller) request = undefined; }
  };
  // This isolated frontend usually watches the old production world. Its bundled
  // totals are real, but the new API belongs to the matching server update.
  const enabled = !isControlPreview() && (!import.meta.env.DEV || factoryHost() === location.origin);
  const timer = enabled ? setInterval(() => void refresh(), 5 * 60_000) : undefined;
  if (enabled) { void refresh(); document.addEventListener('visibilitychange', refresh); }
  return {
    forUser(username: string) { return contributionFor(username, CONTRIBUTION_IDENTITIES, records); },
    dispose() { stopped = true; clearInterval(timer); request?.abort(); document.removeEventListener('visibilitychange', refresh); },
  };
}
