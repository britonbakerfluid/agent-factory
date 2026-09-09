# Repeatable Factory performance checks

Use production builds, one shared synthetic world, and one visible benchmark tab. These scripts run only on loopback and are outside Vite's entry points. They do not connect accounts, load live agents, persist game changes, or ship in the production build.

## Prepare a comparison

From the repository root:

```sh
mkdir -p /tmp/factory-audit
node --import tsx scripts/performance/fixture.ts /tmp/factory-audit/world.json
pnpm build
cp -R dist/client /tmp/factory-audit/baseline
# Make the candidate changes, then:
pnpm build
cp -R dist/client /tmp/factory-audit/candidate
```

Use new, empty snapshot directories for each comparison. Do not copy over an older build, which can retain stale assets. Generate the fixture once and reuse it for both servers. It contains 18 synthetic active agents: 12 in the workspace and 6 on the patio. The garage has no agents.

Run these in separate terminals:

```sh
node --import tsx scripts/performance/serve.ts /tmp/factory-audit/baseline /tmp/factory-audit/world.json /tmp/factory-audit 5184
node --import tsx scripts/performance/serve.ts /tmp/factory-audit/candidate /tmp/factory-audit/world.json /tmp/factory-audit 5185
```

**Always include `factoryServer=local`.** Without it, a production build viewed on localhost can connect to the deployed service. Use a fresh browser profile or clear only these benchmark origins before starting. Match sound and lighting settings and keep other GPU-heavy tabs closed.

## Lighthouse: startup and automated accessibility

Use Lighthouse 13.4.1 with the same Chrome version for both builds. This runs as a temporary tool; it is not an application dependency.

```sh
pnpm dlx lighthouse@13.4.1 'http://127.0.0.1:5184/?factoryServer=local&skyTime=day&skyWeather=cloudy' --preset=desktop --only-categories=performance,accessibility --chrome-flags='--headless=new --window-size=1440,900' --output=json --output=html --output-path=/tmp/factory-audit/baseline-1 --quiet
```

Repeat for port 5185 with a candidate output name. Collect at least five runs per build, preferably alternating builds, and compare medians plus ranges. The desktop preset emulates a 1350×940 viewport at 1× device scale; the Chrome window flag does not override that preset. Do not run frame samples, builds, or other audits concurrently. Keep every run, including outliers, and record any explicit exclusions.

## Frame smoothness: actual room rendering

Open `http://127.0.0.1:5184/?factoryServer=local&skyTime=day&skyWeather=cloudy&benchmark=1` in a visible browser. Use the same tab and window size for both builds, changing only the port. The panel's button takes three 10-second samples after a 5-second warmup. It reports frame rate, 95th-percentile frame time, frames longer than 33.4 ms, long tasks, and whether the document was hidden. The first long-task count includes the warmup; frame timing excludes it.

Measure:

1. Workspace, cloudy day.
2. Garage, cloudy day. Use the bottom room menu because the measurement panel can cover the elevator button.
3. Workspace, heavy rain. Reload with `skyWeather=rain-heavy`.

Results append to `frames-PORT.jsonl` in the output directory. Reject hidden samples and compare only matching viewport sizes, lighting, fixture, and browser. A frame callback is a smoothness proxy, not GPU presentation timing. A 60 Hz display caps these readings near 60 fps; matching that ceiling does not prove equal headroom.

## What the numbers don't cover

This fixture measures rendering and startup with local assets, not production latency, live account flows, or server scale. Lighthouse's largest paint can be a toolbar control rather than the WebGL scene; it is not a game-ready timestamp. A 100 accessibility score covers automated checks on the audited state, not every game interaction or full accessibility conformance. Also check keyboard navigation, focus visibility, screen-reader meaning, and a physical phone.

See [the September baseline](../../docs/performance-baseline.md) for measured results and limitations. Raw HTML/JSON reports belong outside the repository; keep the compact result summary for future comparisons.

References: [Lighthouse variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), [accessibility scoring](https://developer.chrome.com/docs/lighthouse/accessibility/scoring).
