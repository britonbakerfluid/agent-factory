import { loadGitHubConfig, githubRegistrationUrl } from '../server/github/config.js';

try {
  const config = loadGitHubConfig();
  if (!config) throw new Error('Set AF_GITHUB_CONFIG_PATH and AF_PUBLIC_URL first');
  console.log(githubRegistrationUrl(config, process.argv[2] ?? `Agent Factory - ${config.organization}`));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to generate GitHub App setup URL');
  process.exitCode = 1;
}
