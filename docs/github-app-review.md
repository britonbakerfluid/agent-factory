# GitHub App foundation review

Intent: install a GitHub App for each organization's deployment and replace static contribution counts with live GitHub data. First environment: `https://fluid-factory.onrender.com`, organization `fluid-commerce`, repository `fluid-mono`.

Risk: high, because this adds installation authentication, tenant routing, and scoped durable storage.

| Invariant | Failure scenario | Evidence |
| --- | --- | --- |
| A deployment authenticates only its configured organization/app | Forged installation ID, another org, wrong app, suspended installation | `tests/github-app.test.ts`: production-shaped installation responses and spoofed callback/Host requests |
| Credentials stay on the server and requests are restricted | Key/token leaked in browser response or broad repository token requested | Real JWT signature verification, exact token request body, response whitelisting tests |
| Failed authentication cannot permanently wedge future refreshes | HTTP 401, aborted/hanging token request | Refresh recovery and token invalidation tests through the actual ContributionService + GitHubApp adapters |
| Totals never cross deployment/repository/branch scopes | Shared database or reconfigured deployment loads another scope | Cache-scope hash tests, libSQL restart/isolation tests, browser scope/alias replacement tests |
| Missing data never becomes fabricated counts | GitHub outage, malformed response, old cache, missing configuration | Existing count failure tests plus empty-default and browser retention tests |
| Runtime settings reach the container | Public config excluded from build context/image | Dockerfile and .dockerignore inspected and corrected; Docker build remains unverified because daemon is unavailable |

Writer inventory: each process owns one ContributionService. Startup, hourly timer, and direct refresh calls share one pending refresh promise. Authors are read sequentially, capped at 25 per deployment. Each request includes token exchange in a ten-second cancellation boundary. Process shutdown aborts active requests and clears scheduling. Token exchange shares one promise and keeps only an unexpired installation token in memory. SQL writes use a scoped primary key and reject older snapshot timestamps. Multi-process scheduling is not coordinated; deploy one worker per environment.

Compatibility: routes retain existing count fields and add configured identities. The matching updated browser is required to remove bundled historical counts. Legacy database records remain intact, but the new worker never imports an unscoped baseline. Roll out server and client together. Configuration and rollback steps are in `github-app.md`.

Validation completed:

- Final full suite: 126 files / 907 tests passed before merge.
- Final affected tests: 4 files / 51 tests passed (installation/configuration, persistence, count service, browser consumption).
- `pnpm build` passed, including client and server TypeScript checks; existing large-client-chunk warning remains.
- `pnpm github:setup 'Fluid Agent Factory'` produced the expected deployment-specific registration URL.
- `git diff --check` passed.
- Live GitHub registration and installation verified: app `4866829`, installation `159909739`, selected repositories, `metadata:read` and `pull_requests:read` only.
- Live verification at `2026-09-08T01:07:50Z` used the downloaded signing key through the production config loader, GitHubApp, and ContributionService: organization discovery returned 200, token exchange returned 201, all six count queries returned 200, and installation repository listing confirmed access to only `fluid-commerce/fluid-mono`. The read-only Fastify API returned those fresh totals without credentials, and a new service instance restored the same totals from the local cache. Credential-free evidence is saved locally in `.data/github-live-verification.json` (ignored by Git).

Review entry points: `server/index.ts` loads deployment configuration and selects the cache scope; `server/github/config.ts` validates routing and secrets; `server/github/app.ts` owns installation authentication; `server/contributions.ts` owns refresh lifecycle; the browser consumes only the server's explicit roster.

Readiness: **Ready with disclosed risks** for the integration foundation. Live token exchange, all six contribution totals, repository access restriction, API output, and local cache reload are verified. The signing key is stored outside the repository with owner-only file permissions. Render configuration is saved on Fluid Factory (`srv-da700ggae00c7386nue0`): all five GitHub settings persisted after reload and the saved `github-app.pem` exactly matches the local key used for live verification. Pre-merge rollout checkpoint: settings were saved without triggering deployment, while production ran `9b83145` from `main`. Verify the newly deployed commit and fresh contribution timestamps after merge. Container execution remains unverified. One repository, up to 25 configured identities, hourly polling, public aggregate count visibility, and a single worker per deployment are explicit limits of this foundation.
