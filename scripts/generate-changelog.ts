import { writeFileSync } from 'node:fs';
import { factoryChangelog } from '../client/prototypes/factory25dChangelog';

const notes = factoryChangelog.map(release => [
  `## ${release.date} — ${release.title}`, '', release.summary, '',
  ...release.changes.map(change => `- ${change}`), '',
  `Sources: ${release.prs.map(pr => `[#${pr}](https://github.com/wolzey/agent-factory/pull/${pr})`).join(', ')}`,
].join('\n')).join('\n\n');
writeFileSync('CHANGELOG.md', `# Fluid Factory changelog\n\nHighlights reconstructed from merged Git history. Dates reflect merges; exact deployment times were not tracked.\n\n${notes}\n`);
