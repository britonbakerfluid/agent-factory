# Factory performance and accessibility baseline — September 8, 2026

We now have a repeatable local benchmark and a verified automated accessibility improvement. Startup results are encouraging but noisy; this run does **not** establish a reliable FPS speedup or a live-site performance score.

## Before and after

Three Lighthouse 13.4.1 desktop audits per build, Chrome 152, same local fixture with 18 active agents, logged out, cloudy daytime. Desktop emulation was 1350×940 at 1×; simulated network 40 ms RTT / 10,240 Kbps and no CPU slowdown. Builds ran sequentially, baseline first. All runs, including the cold outlier, are retained in [the compact results](evidence/performance-baseline-2026-09-08.json).

| Measure | Baseline median | Candidate median |
| --- | ---: | ---: |
| Performance score | 48 / 100 | 56 / 100 |
| Automated accessibility | 95 / 100 | 100 / 100 |
| First contentful paint | 1.637 s | 1.649 s |
| Largest contentful paint | 2.199 s | 1.689 s |
| Total blocking time | 1,022 ms | 724 ms |
| Speed index | 3.031 s | 2.356 s |

Raw performance scores were **32, 48, 57** before and **56, 56, 61** after. Accessibility was **95 on every baseline run and 100 on every candidate run**. The performance ranges overlap, runs were not randomized, and substantial background CPU activity was observed later. Treat the speed change as a preliminary signal, not a causal percentage gain. The first-paint measurement did not improve.

The baseline includes the pending second dead-code cleanup on top of `e952b2fcbd5235ce4dbb808aa0df4c9f04261a5c`; the candidate adds the four small changes below. The audited main asset changed from `factory25dSlice-DOT9Jqvq.js` to `factory25dSlice-RrU5g-_1.js`.

## Changes made

- Disable Three.js's synchronous shader error diagnostics in production; retain them in development. A browser CPU profile captured roughly 400 ms in `getProgramInfoLog` during startup. Rendering materials, shader code, resolution, and visual quality remain unchanged.
- Skip upper-floor decorative plant and hanging-pothos transforms while settled in the garage. Their animation uses absolute time and resumes at the current pose on return; updates continue during elevator transitions. Shared agents, controls, chat, and physics continue updating.
- Give the whiteboard's game button a minimum 44×44 target. Lighthouse previously measured it at roughly 14×15.
- Keep staff hit targets above the board hit area, with at least 24×24 dimensions. The board previously covered most of its manager's target.

## Frame measurements

Three 10-second samples per scene after five seconds of warmup. The representative candidate groups, with one benchmark tab open at 1280×720, had median frame rates of **59.8 fps in the workspace, 59.8 in the garage, and 59.9 in heavy rain**. The 95th-percentile frame intervals were around 17.5–17.6 ms.

These are observations, not paired gains. The initial baseline used a different 1231×1684 viewport and different saved lounge lighting: approximately 60 fps workspace, 55.8 garage, 59.8 rain. A candidate run with both benchmark tabs open fell to 44–51 fps; it is retained but excluded from representative candidate medians. After matching window size and lights, a baseline repeat fell to 18–27 fps during substantial unrelated CPU load from Claude and other desktop processes. No quiet matched rerun was completed. Every sample is retained with dimensions and visibility flags.

## Validation and limits

Client and audit-tool type checks, Vite production build, server TypeScript build, and **1,018 tests across 135 files passed**. The audit server smoke test verified synthetic snapshots over HTTP/WebSocket, logged-out behavior, result recording, and path-traversal rejection. No benchmark scripts or overlay are in the production HTML/bundle.

Browser checks verified clicking the manager opens the board; clicking and keyboard activation open tic-tac-toe; Enter plays a square; Back returns focus to the board. The room was visually inspected with its keyboard focus outline visible. This is not an audit of every logged-in, mobile, or game state.

Lighthouse can select a toolbar control as the largest paint instead of measuring when the WebGL game is ready. Its accessibility score excludes manual checks, so 100 does not establish full accessibility conformance. Local assets also exclude production network/server latency. See [Google's scoring explanation](https://developer.chrome.com/docs/lighthouse/accessibility/scoring) and [performance variability guidance](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md).

Next: use the [saved procedure](../scripts/performance/README.md) for at least five alternating runs per build on an otherwise quiet machine, then repeat on a physical phone. For further optimization, profile garage draw calls/shadows and batch static car trim while preserving moving parts. The rendering profile showed considerable WebGL submission work; this is a candidate to investigate, not a verified next speedup.

Measurements were taken before publication; they are local benchmark results, not deployed-site scores. The benchmark uses synthetic agents and never connects a real account.
