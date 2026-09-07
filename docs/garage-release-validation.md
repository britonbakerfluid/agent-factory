# Garage and room-life release validation

Base: `c61eb7168e0490dc655e8437326551666d81bffd` on production upstream `wolzey/agent-factory`.

## Verified before publication

- Full Vitest suite: 691 tests across 104 files passed. Client typecheck, Vite production bundle, and server TypeScript build passed.
- Independent server/state review: 71 focused tests passed; existing station indices and saved identities remain compatible. Independent client/asset review: 42 focused tests passed; all four GLBs are self-contained and available in the production bundle.
- Built the actual Dockerfile for Linux amd64 with frozen dependencies, then ran the resulting production image against an isolated local database.
- Authenticated local test agents selected all six ordinary garage stations (18–23) through the real grab/assignment WebSocket protocol. Real hook activity changed each agent to reading.
- Jonathan's local test agent selected the Mini laptop station (24) and entered the real Mini-work state. A separate anonymous WebSocket received all seven agents and the expanded 25-station world.
- The production browser rendered all seven active garage workers, loaded the four car models, completed the elevator transition, and reported no console errors during the check. See `evidence/garage-production-workers.png` and `evidence/garage-production-smoke.json`.
- The racing archive is excluded from the Docker context and production client assets. No racing entry point is included in this release.

All test identities and assignment mutations were confined to the isolated local production container, not the public service.

## Deployment checks

After merge, verify the actual `https://fluid-factory.onrender.com/` service: healthy persistence, expected team data, expanded workstation count, deployed assets, and `world_snapshot.buildId` matching the merge commit. A successful deployment for another Render service is not sufficient.

Contribution levels work from the bundled checked-in totals and cached data. Automatic historical refresh requires the service's optional `AF_CONTRIBUTIONS_GITHUB_TOKEN`; an unconfigured refresh is reported explicitly rather than showing fabricated totals. This release does not install or change production credentials.

Shared visitor driving is scheduled separately in `shared-driving-next-update.md`.
