# Lower-floor garage

This update adds a native downstairs factory room, based on `upstream/main` at `c61eb7168e0490dc655e8437326551666d81bffd`. The running frontend at [fluid-factory.onrender.com](https://fluid-factory.onrender.com) was confirmed to match that main baseline through identical JavaScript and CSS asset hashes. The garage update has not been pushed or deployed.

## Room and visual consistency

### 2026-09-06: volumetric clouds and basketball seams

Clouds use rounded connected lobes, shaded undersides, sun-facing caps, and smaller, lighter banks toward the horizon. The visual reference was [Complementary's Minecraft shader styles](https://www.complementary.dev/shaders/), especially the depth and broad forms in its [official comparison image](https://www.complementary.dev/assets/img/editedScreenshots/styleComparison.png). The implementation refines our existing renderer; no external shader code or artwork was copied. Night clouds inherit subdued sky colors, while precipitation retains the connected storm deck. Local previews now default to the same volume style as production; `clouds=painted` remains an explicit comparison option.

A deterministic 32 KiB filtered density texture replaces repeated trigonometric noise calculations. Rendering retains its 12 Hz update cap and visibility skips. The garage uses the same cloud render target as upstairs, layered between its sky and terrain, without a second cloud render. Owned cloud resources are released on disposal; garage window disposal preserves the shared source texture.

The basketball now has eight panels, two crossing center channels and two bowed loops, informed by [Wilson's Evolution ball imagery](https://mas.wilson.com/products/evolution-game-basketball). Recessed seams and subtle pebbled rubber replace three raised rings. The same visual helper covers local, agent, visitor and remote balls; radius, throwing physics and shared interactions are unchanged. A temporary local material-review page was removed after checking the ball from three rotated angles.

Validation: the full suite passed 526 tests across 82 files. After the final night-color adjustment, all 19 focused cloud, window and basketball tests passed again, as did the production client/server build and whitespace checks. Browser review covered daylight, storm, night, garage windows and a 390×844 viewport with no horizontal overflow; viewport sizing was restored. Physical-phone GPU performance remains unmeasured. [Daylight](evidence/cloud-volume-day.png), [night](evidence/cloud-volume-night.png), [storm](evidence/cloud-volume-storm.png), [garage](evidence/cloud-volume-garage.png) and [phone-sized layout](evidence/cloud-volume-mobile.png) are native browser captures. The [basketball comparison](evidence/basketball-eight-panels.png) is a native capture of the temporary material-review page using the production ball helper, not a gameplay screenshot. These changes remain local with the garage update.

### 2026-09-06: mountain visitor scale and haze

Climbing visitors now use .09-unit sprite planes instead of .19, with proportional rope thickness, harness anchors and ground clearance. The room avatars are unchanged. Terrain, trees, climbers and the rope share `factory25dAtmosphere.ts`, preserving the existing world-depth haze formula and the live weather-colored uniform. Ordinary scene fog still applies afterward. The shared scenery carries this correction into every room's windows. Saved appearances and daytime-only visits remain intact. [Browser evidence](evidence/mountain-climbers-haze-scale.png) shows the corrected visitors against the neighboring trees. All 512 tests across 80 files, production build and whitespace checks passed; no new browser warnings or errors appeared during the final window review. This remains local with the garage update.

### 2026-09-06: enclosed lighting and clear windows

The dark band above the mountains was the sky plane overlapping its opaque backing, not a shade. `factory25dGarageWindows.ts` separates those layers and uses a continuous, aspect-preserving horizon crop across the three panes. The texture references remain shared with the live upstairs sky and landscape; disposing the garage does not dispose those textures.

`factory25dGarageLighting.ts` adds a full shadow-casting roof, side walls and front wall using the main room's invisible cutaway technique, visible perimeter returns, and real openings in the rear wall. Sunlight now enters through those openings instead of lighting an open platform. Two interior ceiling washes and warm fixture lights fill the room; the garage copies upstairs daylight, weather and nighttime light colors/intensities. The interior shadow light points vertically down to avoid a diagonal roof-clipping artifact.

Validation: 511 tests across 80 files, production client/server build, and `git diff --check` passed. Geometry tests cover roof/wall occlusion, clear window paths, shared texture ownership, and day/night changes. Browser QA compared the main room, garage daylight, and garage night; the 390×844 viewport had no horizontal overflow. No new browser errors were recorded after refreshing the previously disconnected development preview. Physical-phone frame rate remains unmeasured. [Daylight](evidence/garage-lighting-day.png), [night](evidence/garage-lighting-night.png), and [phone-sized viewport](evidence/garage-lighting-mobile.png) are native browser screenshots.

Release audit refreshed `upstream/main`: local HEAD and main both remain `c61eb716`, with no open upstream PR. The actual Fluid production WebSocket reports that same build and `factory25d`; health and persistence are healthy. This garage update remains local. Release still requires committing all active garage modules/models/tests and the preserved archive, pushing a branch, PR checks/review, merging, and verifying the matching client/server build on `fluid-factory.onrender.com` itself. The broader car/prop proportion audit is a separate visual refinement; the garage update exposes no driving route.

### 2026-09-06: car scale and parked-car visits

Cars now use uniform scale .75 (previously 1.4); agents remain at their canonical scale 1. The Mini roof is .8775 high versus the default agent's .7525 painted height. Parking marks and pedestrian collision bounds now follow the smaller vehicles. See [the measured clearance audit](garage-car-clearance.md): all four cars clear the complete bay-to-ramp maneuver across 2,905 sampled poses each. Ramp crest/underside contact and the exterior landing still need work before actual driving can ship.

The garage's **cars → get in + rev** action routes an owned idle agent to a safe lookout, then uses the existing avatar and GLB entry, door and driver-seat nodes for a 12-second parked sequence. The person walks around the rear quarter, opens the left door (or climbs into the F1), sits, gives two short revs, exits, and walks back. The Porsche/Mini inward door signs are corrected; the DeLorean's gullwing uses its authored hinge. Cars gently vibrate on revs; reduced motion disables vibration and the F1 boarding hop. Transparent glazing allows the seated avatar to be occluded naturally by the body and roof.

Server state reserves one driver per car and rejects unauthenticated, unowned, busy, controlled, held or already-visiting agents. Jonathan's automatic Mini visits use the same sequence; a second visitor watches outside. Work, manual control, a grab, or restart cancels the sequence. These live-agent behaviors require deploying this matching server update; the old shared server cannot yet accept car visits.

Engine notes are synthesized locally and share the factory's existing opt-in master sound/volume controls. Mini, Porsche, DeLorean and F1 have different tones. Leaving the garage, opening avatar editing, muting sound, hiding the page or disposing the scene fades and stops the engine. No engine audio assets or external requests were added.

[Local car playground](http://localhost:5173/prototype-25d-slice.html?controlsPreview=garage) explicitly uses sample agents with an in-memory transport and sends nothing live. It opens downstairs with an idle sample agent ready to try the four cars. The normal preview remains connected read-only to the shared server.

Validation for this addition: 482 tests across 75 files passed, including actual GLB bounds, door direction, seat anchoring, cancellation, owner checks and sound lifecycle. Production build passed. Browser review verified the Mini and F1 seated/rev phases and a 390×844 mobile action with a 346×44 touch target and no horizontal overflow. Engine opt-in reached “sound on” with no browser errors; speaker fidelity and physical-phone performance were not independently measured.

The garage lives at y=-12 in `client/prototypes/factory25dGarage.ts`, with solid furnishings in `factory25dGarageFurnishings.ts`. Its 24 by 20.8 floor follows the reference: mountain windows across the back, four angled car bays, broad open center, workshop and tire storage front left, two cabinet workstations, lockers/tool chest/coffee, and a recessed purple lounge front right. The cars remain the established Porsche, green Mini with a white roof and no stripes, DeLorean, and F1 models.

A compact passenger lift sits at the rear left on both floors. Its outer assembly is 1.65 units wide and 1.95 high, with sliding metal doors, a cyan floor indicator, and a warm cabin light. A separate vehicle ramp occupies the right wall. The old inter-floor stair opening is removed; the small sunken-lounge steps remain. The plant shelf now lives downstairs at local x=-8.15, z=-3.85, between the lower lift and the window desks, leaving the upper lift and whiteboard clear.

The garage camera fills the same frame as the main room and keeps the miniature agent scale. Factory plants, contact shadows, live avatar rendering, and the existing pixel dock treatment are reused. The windows share the live mountain texture and factory sky. Current main landscape and wildlife behavior is preserved.

`factory25dElevatorTrip.ts` sequences departure, covered travel, and arrival. The displayed floor changes while the travel overlay is opaque; navigation is locked during the trip. Reduced motion uses a short stationary fade. The lift itself and its 44px call button are clickable, and the garage dock returns upstairs.

## Real agents and workstations

The garage has six general workstations: four compact desks under the windows and the two front cabinet stations. IDs `garage-2` through `garage-5` append slots 20–23, preserving the earlier station IDs and positions. The portable `garage-mini` workstation appends slot 24 for exact username `jonathanvergara`: 24 general workstations plus one personal spot across all rooms. Screen activity uses the factory's live status colors.

### 2026-09-06: Jonathan's Mini laptop

When Jonathan starts real work downstairs, the server prefers the available Mini workstation; another one of his sessions uses a regular garage desk if the Mini is occupied. His existing saved avatar opens the actual Mini door, takes a small laptop from the cabin, carries it to a folding stand, and types beside the car. The stand's desktop is .3375 above the floor and disappears when packed. Idle sightseeing never invents work. The server shares an arrival-based setup clock and reserves the Mini through the 4.5-second pack-up; car rev visits cannot overlap it. Work canceled before laptop retrieval skips packing. Manual control, a grab, session end, or avatar editing cancels the visual override safely.

The [Mini laptop playground](http://localhost:5173/prototype-25d-slice.html?controlsPreview=mini-laptop) uses a clearly named Jonathan preview with the default sample avatar, not a claimed copy of Jonathan's personalized appearance. Its **start working** and **pack up** buttons are local demo controls only. Production behavior requires deploying the matching server and client. [Desktop evidence](evidence/mini-laptop-desktop.png) shows the implemented working state. Browser QA verified retrieval, working, packing, and the 390×844 layout without horizontal overflow; no console errors were observed. Final validation: 501 tests across 78 files passed, and the production build passed. The broader car/prop proportion audit remains a separate refinement.

Shared navigation avoids the desks, parked cars, vehicle ramp, lounge, and relocated shelf. Agents, labels, shadows, and effects use the same room-aware placement. Cross-floor passengers disappear inside the lift shaft and reappear at the destination landing. Garage assignment and routing are implemented in the matching client and server; previews connected to an older server must keep that compatibility limitation visible.

`factory25dRoomNavigation.ts` resolves room transitions consistently when assigning a workstation or opening a room-specific interaction. Browser review confirmed assignment from garage to patio and back, avatar editing at a garage desk, and the C chat shortcut returning upstairs before opening chat.

Idle agents can visit the Mini through the lift, stop at a clear inspection spot, look toward the car, and return home after a 12-second dwell. Only the exact username `jonathanvergara` receives the frequent-visitor behavior; neither the first name nor a username substring matches. Other agents visit rarely. The current cadence considers Jonathan on alternating eligible excursions and other agents once per 16-excursion cycle, subject to a free lookout. Two separated lookout positions prevent visitors from overlapping.

Resuming work or taking manual control cancels an idle visit, including during lift travel. A server restart clears the temporary visit state and resumes at a safe home position.

## Racing preserved for later

Racing is outside this room update. The active garage has no driving entry, race iframe, lap-record board, or racing HUD. The old embedded package, standalone source, Blender source, models, scenic road modules, and racing tests are preserved in [experiments/motorclub](../experiments/motorclub/README.md), with an integrity manifest and restoration notes.

The archive is outside Vite's client/public inputs and the active test pattern, and `.dockerignore` excludes it from the production build context. The built client contains no motorclub package or distant-traffic asset. The four display car models remain active garage assets. The original standalone study checkout is preserved separately and was not deleted.

## Preview and delivery status

### 2026-09-06: attached names and eastern mountain bedding

Name labels now project the current sprite's painted foot anchor, including pose transforms, rather than projecting the floor beneath an airborne character. Removing the extra vertical centering keeps text closer while preserving its touch area. Native review covered a sample patio jump and agents at both patio elevations, plus a 390×844 layout: [desktop](evidence/patio-label-feet.png), [phone width](evidence/patio-label-feet-mobile.png).

The procedural east mountain uses sparse, low-contrast bedding that bends with depth instead of continuous vertical fractures intersecting horizontal courses. The western mesa's original marks remain identical. Geometry, lighting, haze, and the optional Blender terrain stay unchanged. [Right mountain evidence](evidence/right-mountain-bedding.png) shows the actual post-rain daylight window view. This refinement passed 42 focused tests, the production build, and whitespace checks; it remains local.

### 2026-09-06: visible arrivals and safe movement

New factory arrivals start inside the visible right-hand patio doorway instead of below the camera frame. The client also recognizes the older server's exact entrance coordinate and moves that arrival to the same doorway, preserving its destination and timing. Valid patrol routes and idle positions remain unchanged. A sampled production patrol route was clear; the confirmed below-frame entrance and failed-route fallback were separate defects.

Automatic movement now validates each route segment. Invalid origins are recovered onto the same floor, stale routes are rebuilt around obstacles, and an unreachable workstation leaves the agent waiting safely instead of falling back to a straight walk through a wall. Client compatibility repair shares the elevator's route so passengers remain hidden during shaft travel. The canonical server entrance and server routing guards take effect when this update is deployed; client compatibility works in the current local preview against the older shared server.

The development-only `arrival` and `legacy-arrival` control previews reproduce both entrance formats without sending live actions. Browser review verified entry through the visible doorway and arrival at the assigned workstation: [doorway](evidence/arrival-doorway.png), [workstation](evidence/arrival-at-workstation.png). Names are smaller, with levels confined to hover, focus, or tap details: [desktop](evidence/smaller-agent-names.png), [mobile tap](evidence/level-details-on-tap.png). The mobile popup fits the scene and appears above the elevator button. Full validation passed: 576 tests across 87 files, production build, and `git diff --check`.

- Desktop preview: `http://localhost:5173/prototype-25d-slice.html`.
- Previous same-WiFi preview: `http://192.168.86.247:5174/prototype-25d-slice.html` (verified during the earlier integration; not restarted or reverified in the lighting pass).
- The current port 5173 preview runs from `/Users/britonbaker/Code/agent-factory-garage-update`. The original source checkout remains intact.
- Port 5186 belongs to the separate driving study and does not represent this room update.
- No push or public deployment has been performed for the garage update.

## Validation and image provenance

The initial room-integration production build and `git diff --check` passed, with 469 tests across 72 files, including three room-navigation tests. Subsequent additions and their newer validation are recorded above. Browser review verified garage/patio assignment in both directions, avatar editing at a garage workstation, chat navigation back upstairs, and navigation being unavailable during camera inspection. A 390 by 844 browser viewport verified mobile elevator entry, a 44 by 44 call target, and no horizontal overflow. Viewport sizing was reset. Browser console had no errors. Physical-phone performance remains unverified.

The racing archive's 75 input files were checked against its byte counts and SHA-256 hashes. Production output was checked for absence of the archived racing package and traffic asset, and for continued inclusion of all four garage display cars.

The generated [garage update concept](concepts/garage-update-concept.png) is design inspiration, not an in-game background or a screenshot proving implementation. See [concept provenance](concepts/provenance.md) for its origin. [Desktop](evidence/garage-update-desktop.png) and [mobile](evidence/garage-update-mobile.png) evidence are unedited captures of this final native implementation. Older evidence files predate the integration.

The separate patio worktree was not edited by this garage integration. Future changes should retain the narrow room hooks and stable appended workstation IDs.
