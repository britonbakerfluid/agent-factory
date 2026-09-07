# Room life and shared garage driving release

Base: `456f107b965808c6c888ce711dfa23a75ec85e5b`, verified as both upstream main and the actual Fluid service build before publication.

## Scope

- Public, server-controlled driving in the connected garage: exclusive anonymous car controls, switching cars, collision-aware automatic parking, damage, drift marks and the hovering DeLorean. Idle agents can take a short drive; existing work reservations win. The outdoor racing course remains archived.
- Smoother agent movement and walk poses; a steady orthographic elevator ride; smaller lift clearance; rigid vending motion; beanbag console; lounge phone arrival notifications; removed lounge sign.
- Original Fluid and We Commerce downloads in the small artifact shelf, the WE cloth flag, the interactive Mist comparison flag, and a lake canoe with saved team avatars.
- Instanced hanging-plant leaves and distance-based patio groundcover detail, preserving close-up foliage.

## Verification before publication

- 808 tests across 118 files pass, including four added regressions from the release review. Both client/server TypeScript builds and the Vite production build pass.
- The review fixed a stale car-owner race: a previous driver disconnecting, sending stale input, or expiring cannot affect a newly claimed car. Repeated park messages acknowledge without broadcasting unchanged state to all viewers.
- Built the actual Dockerfile for Linux amd64. Image `sha256:6635cc7620a3866af6b438d51438a828de43f4a001bf0a7c3135929b759cfeed` starts with production settings against an isolated local database and reports healthy persistence.
- The production image serves all 14 selected brand/download/car assets byte-identically to the source files. No new dependency or production credential is required.
- Two real anonymous WebSocket clients against the isolated container verified exclusive claims, conflicting-claim rejection, shared car motion, switching from Mini to DeLorean, 1.45m hover height and release. The snapshot advertises all 25 workstations.
- Browser review checked both elevator landings and the intermediate vertical glide, repeated vending activation, the eight-asset library, patio and Mist flag interaction. The production bundle also exposed car selection, driving buttons and parking at 390 x 844 without horizontal overflow; temporary viewport settings were reset. No console errors were captured in the local or production-build checks.

The browser check uses an emulated phone-sized viewport, not a physical-phone frame-rate benchmark. Full-screen landscape racing, new hosting, and storage migrations are outside this release. Shared test mutations were confined to localhost.

## Deployment verification

Use the existing `wolzey/agent-factory` main deployment to `https://fluid-factory.onrender.com/`. Preserve service configuration and durable storage. Verify that service's health, team count, root assets, garage-driving capability and WebSocket build ID against the merged commit; a success for a different Render URL is not evidence that Fluid updated.
