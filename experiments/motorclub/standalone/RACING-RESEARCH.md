# Mountain time trial — research and decisions

Historical research snapshot. The user subsequently approved implementation; see IMPLEMENTATION.md for the current game and verification status. The decisions below preserve the original research context.

## Confirmed direction

- Single-player time trial through the actual mountain environment outside Fluid Factory.
- One shared track for every car; choose Porsche, green Mini Cooper, DeLorean or F1.
- Cars have different driving stats.
- A physical best-times board belongs in the garage.
- Desktop and mobile are both target platforms.
- Keep research and eventual garage work separate from the active lounge/chat/avatar work.
- Investigate the rolling-ball car technique the user remembers from Twitter. It is a reference to assess, not a required implementation.

The Mini's racing-green paint and removal of its bonnet stripes were completed separately before this research decision. Its white roof remains.

## Likely matches for the remembered clip

1. [Kenney's arcade car controller post](https://twitter.com/KenneyNL/status/1107783904784715788), March 18, 2019. Describes a rolling sphere, a car model following its position, forces along the car's heading, and ground-normal sampling for the visual body's orientation. The post is preserved as an attributed embed in [Unity Discussions](https://discussions.unity.com/t/making-a-car-without-wheel-colliders/845687) and a [2019 roundup](https://halisavakis.com/technically-art-issue-10-22-03-2019/).
2. [Nitroneers' rolling-sphere car post](https://twitter.com/Nitroneers/status/1238779466832363520), March 14, 2020. A closely related game example explicitly describing arcade drifting with one large sphere per car. Its attributed embed is preserved in [this Unity physics article](https://content.marchewitt.com/intro-to-unity-physics-part-1-rigid-body).

Direct Twitter fetching was blocked or returned no content. These are strong candidates with corroborated descriptions, not confirmation of the exact clip the user saw. No claim is made to have watched the original videos this turn.

## What the technique actually means

An invisible spherical physics body carries position, momentum and ground collisions. The visible car follows the sphere's position but does not inherit its rolling rotation. Steering changes where the car points, and propulsion acts in that direction. Momentum can continue along a different direction, which creates the visible sideways slide. Traction still needs deliberate tuning to make the slide recover predictably.

The sphere does not have a special "drifting angle" mode: drift is the difference between the car's heading and its actual travel direction. The same separation can be implemented without a sphere.

Primary implementation references:

- [KidsCanCode: rolling-sphere arcade car](https://kidscancode.org/godot_recipes/3.x/3d/3d_sphere_car/index.html): author's working example with force-based sphere motion, separate visual model, ground alignment and visual wheel/body motion. Godot 3 code is a conceptual reference, not a library to insert into the Three.js project.
- [KidsCanCode: traction and drifting](https://kidscancode.org/godot_recipes/3.x/3d/kinematic_car/car_traction/index.html): author's alternative separating heading and velocity with configurable traction.
- [KidsCanCode: slopes and ramps](https://kidscancode.org/godot_recipes/3.x/3d/kinematic_car/car_slopes/index.html): front/rear ground probes for visual slope alignment.
- [Retro Karting League developer's sphere-controller experience](https://sporktank.itch.io/retro-karting-league/devlog/373320/kart-controller): a historical Godot mesh-seam problem encountered by that developer. This does not establish the same issue in a current browser physics engine.

## Assessment for our mountain trial

The rolling-sphere approach is a plausible candidate for playful drifting and forgiving car motion. It does not inherently solve grip, reliable edge collisions, slope transitions, timing fairness or mobile performance.

Before choosing it, a later authorized handling comparison should check uphill starts, sustained uphill/downhill speed, a hairpin and drift recovery, front/rear wheel contact over a crest, guardrail contact at nose and sides, road seams, respawning and mobile steering. A single central sphere may not represent a long vehicle's nose, tail and four contact points well enough; additional ground probes or collision geometry may be needed.

Compare against a compact arcade controller with independently tuned speed, heading, lateral grip and ground alignment. Choose based on predictable, enjoyable driving over the actual terrain. No controller or engine switch is selected yet.

## Proposed run and record design

These are recommendations, not additional confirmed requirements:

1. Choose a car in the garage and inspect its stats.
2. Start the same mountain route from the same start line. A short countdown precedes timing.
3. Follow ordered checkpoints through the scenery to the finish; the route prevents cutting directly to the finish.
4. Show finish time, the difference from the selected car's personal best, and retry/return choices.
5. Reflect the record on a modeled board in the garage. Lower time ranks higher.

The garage board should show overall personal best runs with the car identified, plus each car's personal best. This gives the Mini and DeLorean a meaningful record even if the F1 ultimately achieves the outright fastest time. This is a personal record board, not a requirement for multiplayer or a public leaderboard.

Local persistence can support the first single-player version. Cross-device record synchronization, if wanted, is a separate decision; single-player alone does not imply cloud storage. Keep record versions tied to the track and handling version so future tuning does not silently mix incomparable times. Fixed driving conditions would make runs easier to compare. These policies remain proposals.

## Proposed car identities

Game-feel targets, not measured real-world vehicle specifications and not implemented numeric stats:

| Car | Suggested strengths | Suggested tradeoff |
| --- | --- | --- |
| Mini Cooper | Nimble steering, easy recovery, forgiving low-speed control | Lower top speed |
| Porsche | Balanced acceleration, braking and predictable cornering | No single dominant advantage |
| DeLorean | Strong momentum and longer controllable slides | Slower steering response and braking recovery |
| F1 | Highest straight-line potential and strong fast-corner grip | More demanding inputs and less forgiving road-edge mistakes |

Useful visible stats: acceleration, top speed, grip, braking and handling. Final values require driving tests; no numbers are proposed as already balanced.

## Research boundary

No gameplay, terrain, vehicle model or active-factory source changes were made for this research turn. This document captures the chosen game and the reference investigation so later implementation can follow the decision without treating untested suggestions as completed features.
