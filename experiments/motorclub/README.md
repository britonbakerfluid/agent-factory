# Motorclub archive

The garage room update does not include racing. This directory preserves the earlier mountain time-trial experiment for a separate future project. It is outside the active client, public assets, and test inputs, and `.dockerignore` excludes it from the production build context.

The garage cars, elevator, furniture, and live-agent workstations remain in the active factory. The original standalone checkout at `/Users/britonbaker/Code/agent-factory-garage-study` has not been moved or modified by this archival step.

## Contents

- `standalone/`: a portable copy of the racing study's source, package lock, models, Blender source, model scripts, tests, and research notes. Dependency folders, generated builds, Blender backup files, and QA captures are omitted. This includes the drift tire marks and terrain fixes.
- `embedded-build/`: the former `client/assets/prototype25d/motorclub/` bundle, preserved byte for byte. It is a historical packaged build; rebuild the standalone source before any future integration.
- `factory-source/client/prototypes/`: the dormant scenic road, track, terrain grading, and road-paint modules. Clean landscape/mountain integration snapshots come from the original garage worktree.
- `factory-source/client/assets/prototype25d/garage-distant-cars.glb`: the compact traffic-only car models. The display car models remain in the active garage assets.
- `factory-source/tests/`: the scenic-road tests, outside the active `tests/**/*.test.ts` test pattern.
- `integration/`: the latest main baseline, exact pre-removal files and diff (including the interrupted mountain merge), and a clean integration diff for reference.
- `manifest.json`: original locations, preservation actions, byte counts, and SHA-256 hashes for all archived input files.

## Run the separate experiment again

Use `standalone/` as its own project. Run `npm ci`, then `npm run dev -- --port 5188` to avoid taking over another local preview. Its usual validation is `npm test` followed by `npm run build`.

On that development server, `/?factoryCar=porsche&drivecheck=1&driftcheck=1` starts the isolated tire-mark preview. The development-only driver does not affect ordinary controls or production gameplay.

## Restore a factory integration later

1. Treat this as a new scoped feature. First reconcile the racing scene, terrain, camera, and UI with the factory's current room behavior.
2. Restore only the needed road modules, distant-car asset, and tests from `factory-source/` to their corresponding original paths.
3. Use `integration/landscape-and-mountains.patch` as a review reference. Do not overwrite newer landscape or wildlife behavior with the archived files: the clean snapshots predate later main-branch changes. The files under `integration/pre-removal/` are evidence of the interrupted integration, not ready-to-apply source.
4. Reintroduce any garage entry and return flow deliberately. The garage room no longer depends on the old racing iframe or local lap-record UI.
5. Rebuild `standalone/` with the intended public base (`/prototype25d/motorclub/` for the historical embedding), then copy that generated build to a public directory only as part of the separately reviewed integration.
6. Run current factory tests/builds and visually check indoor windows, patio views, camera clearance, touch controls, and performance before shipping that feature.

No restoration is performed automatically. Keeping this archive in the repository does not make it part of the application bundle or Docker image.
