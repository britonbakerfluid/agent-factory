# Fluid Factory mountain time trial

Implemented in the isolated garage project. Local preview: http://127.0.0.1:5186/

## Play

Select any parked car, review its stats, and choose **drive the loop**. Finish the same 1.45 km mountain circuit through 15 intermediate checkpoints. A typical scripted Porsche lap is about 78 seconds; human lap times depend on driving.

Desktop: W/Up accelerates; A/D or Left/Right steer; S/Down/Space brakes and reverses once stopped. R resets to the last cleared checkpoint with a two-second penalty. Escape pauses. Resume is explicit. Cars hold still while waiting on a hill.

Phones: automatic acceleration, left/right steering buttons and a brake/drift button. Brake holds the car rather than reversing. Portrait and landscape layouts are supported. Interrupted touches, backgrounding, focus loss and long frame stalls pause the run and clear inputs.

Braking while steering at speed loosens grip for a controlled slide. Mini is forgiving and nimble, Porsche balanced, DeLorean heavier and slower to recover, and F1 fastest with sharper steering. Mini remains green with a white roof and no stripes. Wheels and front steering animate; DeLorean doors close for driving.

## Architecture

- `src/racing/core.ts`: fixed-step arcade physics, common tuning/interfaces, one road definition, directional checkpoints, timer, penalties and versioned record helpers.
- `src/racing/world.ts`: original mountain GLB at driving scale, graded road and sloped embankments, guardrails, checkpoint markers, start/finish and factory landmark. The source mountain file remains intact. The road is also rendered through the garage window.
- `src/racing/game.ts`: garage/loading/countdown/racing/paused/results coordinator, selected car cloning/batching, chase camera, record board and rendering quality adaptation.
- `src/racing/input.ts`, `audio.ts`, `hud.tsx`, `game.css`: input lifecycle, synthesized sound and mute, accessible HeroUI actions and responsive layout.
- `src/racing/sphere-lab.ts`: isolated Rapier rolling-sphere experiment; it is not imported by the game. The baseline remains selected. In the final scripted comparison, the sphere finished but had a 2.9 m ground gap; no human comparison has approved switching to it.

Records live in this browser only, under a track-and-handling-version key. Overall top five and each car's personal best are retained. Corrupt records are ignored; storage failure keeps in-session results and displays a notice. Update the version constants whenever route or handling changes invalidate comparison.

## Verification

- `npm test`: checkpoint order/direction/width, reset penalties, fixed simulation at 30/60/144 Hz render schedules, record validation/ranking, real-mesh clearance, hill starts and guardrails, input interruptions/multi-touch state, and actual React/HeroUI state rendering in a simulated DOM.
- `npm run test:drive`: all four baseline cars finish the actual route; Porsche 77.593 s, Mini 80.368 s, DeLorean 81.059 s, F1 74.276 s in the scripted regression driver. These are test results, not a claim of human balance. Full metrics are in `evidence/drive-check.json`.
- `npm run build`: type check and production build. A bundle-size advisory remains for the combined Three.js/React interface; this is not a build failure.
- Browser: full scripted Porsche lap, finish/results, pause/resume, garage return and record persistence after reload. All four models enter the race. Observed desktop rendering around 120 fps during the measured segment, at 1280×720, with 143 draw calls; this is not a phone benchmark.
- Browser device emulation: 390×844 portrait and 844×390 landscape layouts, Mini auto-acceleration, reset and pause. Actual simultaneous touch delivery is not exposed by this browser automation backend; multi-touch state/cancellation are covered in the input tests.

For repeatable rendered-lap checks, the **development server only** accepts `?drivecheck=1`. Select a car and drive normally through the UI; the test driver supplies input. A visible notice identifies the scripted run, and all test records use a separate storage key. The public entry point has no automated driver. This verifies rendering and the real game state machine, not human driving feel.

## Remaining verification

Physical-phone driving and sustained GPU performance remain unverified. Browser emulation is not a substitute. A human handling pass is also still useful before treating tuning as final.

The current development server is loopback-only. For an explicitly arranged same-network phone check, start this project's server with `npm run dev -- --host 0.0.0.0` and open the Mac's LAN address on the phone. Stop LAN serving afterward. No public deployment, factory integration, account system or cloud synchronization was performed.

## Isolation

This folder now has its own dependency installation and lockfile; it no longer shares the factory's node_modules. All source work stayed here. The active factory source checkout and port 5173 server were not modified or restarted. No commit, push or deployment was made.

## September 5 follow-up: distant cars in all three views

The user subsequently authorized the scenery connection. Four lightweight versions of the modeled cars now follow the route in the factory's shared mountain texture (factory window and patio) and the separate garage window. These are ambient scenic drives, not live multiplayer cars or a replay of the player's run. The garage/race entry itself remains a separate local preview.

The active factory checkout now intentionally has a four-line integration in `factory25dMountains.ts`, plus new `factory25dMotorLoop.ts`, `factory25dMotorTrack.ts`, `garage-distant-cars.glb` and a focused test file. Lounge/chat/patio interaction sources were not edited. The original mountain asset is unchanged. The fleet asset has four draw calls and 7,786 triangles total; its Blender export recipe is `scripts/build-distant-cars.py` in this study folder.

Five factory tests passed (loading/motion, pause, re-grounding, repaint cadence and real GLB structure). Factory type checking, client build and diff checks passed. Browser captures verify the window and patio scenery; the garage preview was checked as well. A multiple-Three-instances warning was observed during these checks; no car asset load warnings occurred after correcting the public asset path and export names. There was no commit, push or deployment.

## Arcade pace pass

Handling arcade-2 targets a lively 150cc-inspired feel, not a numerical Mario Kart speed conversion. Increased acceleration and steering response, reduced speed loss under combined throttle/turn/brake, and added a gradual 58–68 degree chase-camera field of view. Existing arcade-1 records remain in their separate storage key. Scripted checks finish all four cars without collisions; human feel and physical mobile testing are still required.

## Drift and release boost

arcade-3 adds an explicit drift control (Space or Shift; separate touch drift button). Enter above 8 m/s while steering on the road. Steering widens/tightens the held direction. Charge requires steering into the drift, with .75s blue / 1.5s gold yielding .65s / 1.15s boost. Braking, impact, off-road, pause, and reset cancel drift charge. HUD includes a charge meter and release instruction. Records use the new handling key. Automated mechanics and input tests pass; actual human drift feel is pending playtesting.

## Garage departure and terrain-safe camera

The chase camera now validates its final interpolated position, near-plane footprint, and view line against both the mountain mesh sampler and raised road. Actual-terrain regression covers desktop and portrait follow distances around the circuit.

Starting a drive stages a small driver walking to and boarding the selected car, raises the garage shutter, drives through the aisle and door, then follows an exterior approach to the start. A copy of the actual garage replaces the generic track-side building and an open driveway junction connects it to the course. The garage and race still use two render scenes with a camera handoff at the doorway; this is a connected departure sequence, not yet a freely walkable continuous world or the main factory's selected-avatar integration.

## Factory visual consistency

The asphalt now owns its paint in one MeshStandardMaterial shader. A distance-along-road attribute drives double solid, one-sided dashed, and merged single-line stretches; the fragment mask removes the dash gaps without separate dash meshes. Fine aggregate noise modulates pigment and edge wear. The same material source is copied to factory25dRoadPaint.ts for the scenic window/patio track.

Chase framing is now 26m back (31m portrait), 19m high, with a restrained 50–52 degree field of view. The existing final-position terrain check covers those distances. Reduced bright ambient light, deeper blue/violet shadows, stronger terrain pigment, and more distant fog bring the palette toward the factory. The HUD is a compact bottom pixel-island using the main room's button geometry and colors; touch controls reserve a separate bottom area. Physical phone testing remains unverified.

Rebuild the embedded copy without changing the standalone artifact: `npx vite build --base=/prototype25d/motorclub/ --outDir dist-factory`, then copy dist-factory into the factory's client/assets/prototype25d/motorclub directory. The outer garage dock now also uses the factory's pixel-island class.
