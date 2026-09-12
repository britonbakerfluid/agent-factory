import { writeFileSync } from 'node:fs';
import { factoryChangelog } from '../client/prototypes/factory25dChangelog';

const repository = 'https://github.com/wolzey/agent-factory';
const notes = factoryChangelog.map(release => {
  const sources = [
    ...release.prs.map(pr => `[#${pr}](${repository}/pull/${pr})`),
    ...('commits' in release ? release.commits.map(commit => `[${commit}](${repository}/commit/${commit})`) : []),
  ];
  return [
    `## ${release.date} — ${release.title}`, '', release.summary, '',
    ...release.changes.map(change => `- **${change.label}** ${change.text}`), '',
    `Sources: ${sources.join(', ')}`,
  ].join('\n');
}).join('\n\n');
writeFileSync('CHANGELOG.md', `# Fluid Factory changelog\n\nHighlights reconstructed from Git history. Dates reflect merges, or source commits for the original factory; exact deployment times were not tracked.\n\n${notes}\n`);
