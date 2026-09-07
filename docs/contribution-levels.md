# Factory contribution levels

Names use smaller 9–11px lettering, without a persistent level badge. Hovering, focusing or tapping a name opens its existing details, with the LV badge beside the title, historical total, progress to the next level, GitHub account and verification date. Every agent for the same factory username shares their level across the factory, patio and garage. Task titles, activity, tool counts and avatar behavior stay independent of contribution credit.

Names now follow each animation frame's painted feet through the sprite's current transform, including jumps, carried poses, car seats and raised patio floors. The text starts near that anchor instead of being vertically centered inside its 24px hit area. Three placement regressions cover floor/frame changes, lifted/rotated poses, and fresh parent transforms/camera zoom; the level remains confined to details.

## What counts

One authored pull request merged into `fluid-commerce/fluid-mono` with base branch `main` earns one contribution. This counts work from before the factory existed and credits the author rather than the person pressing Merge. Direct pushes and individual commits do not count. The total is a lightweight game statistic, not a measure of code quality or work performance.

Level L starts at L × (L − 1) / 2 contributions: levels 1, 2, 3 and 4 start at 0, 1, 3 and 6. At 542 contributions Mike is level 33, with 14 of the 33 contributions needed for his next level and 19 remaining. There is no activity decay.

The initial five mappings in `shared/factory-contribution-seed.ts` were checked against the live factory roster and GitHub contribution history: michaeltingey → tingeym, Briton Baker → britonbakerfluid, jonathanvergara → Jonathanvergara, Wolzey → wolzey, and BrayPay → braypay. Counts were verified using GitHub's merged-PR search on September 6, 2026. Matching is case-insensitive but exact; unknown names have no badge rather than an invented level-one total. These are curated display aliases, not a new identity/authentication mechanism. Adding another person requires confirming their GitHub account and adding an explicit mapping; changing a task title cannot claim a level.

## Refresh and release

`ContributionService` refreshes the five known accounts on startup and hourly using [GitHub's search API](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests). Browser requests to `/api/contributions` only read cached public totals; they never trigger a GitHub call. The client polls every five minutes while visible and preserves its last verified totals on network errors or malformed/stale responses. Partial GitHub search results, timeouts, auth failures and rate limits do not overwrite known counts.

Successful server totals use the existing durable libSQL/Turso database in a separate single-row `contribution_totals` table. The table is created additively during normal initialization; no world, team or avatar records are changed. `AF_CONTRIBUTIONS_CACHE_PATH` optionally substitutes an atomic file cache for local installations. Only account names, counts and timestamps are saved or returned.

**Automatic refresh requires the deployment's `AF_CONTRIBUTIONS_GITHUB_TOKEN` to have read access to fluid-mono and permission to search its pull requests.** This token stays server-side and never enters the generated client, public endpoint or cache. It has not been installed on the production service. Without it, verified bundled history (or a newer persisted cache) remains visible and the API reports `refresh: unconfigured`; the UI always shows the actual check date. To refresh the bundled history locally, run `npm run sync:contributions` using the existing GitHub CLI login, which replaces the seed only after every requested count is complete. The normal isolated localhost frontend uses that verified seed until the matching backend is deployed; `factoryServer=local` can exercise a local backend.

## Validation

The seed-refresh command was exercised against real GitHub data. The server's refresh implementation and read-only Fastify route were also verified against GitHub using the existing CLI login in memory; no credentials were saved and no external state was changed. The full suite passed 568 tests across 86 files. Focused tests cover level boundaries, exact attribution, unknown vs confirmed zero, nameplate accessibility, browser polling/cleanup, network failures, cache integrity and durable restart behavior. Desktop and 390×844 browser checks exercised the visible badge and progress details; these are viewport checks, not physical-phone performance measurements. The final phone correction keeps the taller popup within the clipped room bounds and above activity bubbles, with scrolling if needed. Native captures are in `docs/evidence/contribution-level-desktop.png` (live Mike) and `contribution-level-mobile.png` (the existing local Jonathan sample scene using the verified account total, not his saved appearance).

This is part of the local garage update. No push, merge or production deployment has been performed.
