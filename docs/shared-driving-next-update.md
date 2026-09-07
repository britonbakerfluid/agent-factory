# Shared driving — next update

Status: garage-floor driving is now implemented locally; see `garage-driving.md`. The connected ramp/exterior portion below remains future work. Neither this driving change nor the recent room-life follow-ups have been deployed from the current worktree.

Click a parked car to drive it around the actual factory scene. Other visitors see the same car movement, collisions, damage, and tire marks in real time. Signed-out visitors can drive too. Keep the garage, elevator, working agents, and current room transitions intact.

## Experience

- Enter and leave through the car, using an animation that fits the existing characters. Follow the car through the garage ramp into the connected exterior instead of opening a separate game.
- Give the Porsche, green Mini (no stripes), DeLorean, and F1 different handling: acceleration, mass, braking, steering, grip, and drift response. Tune a believable, readable feel on desktop and mobile; do not promise a full simulator.
- Support drifts, persistent-for-the-session tire marks, collisions with the scene and other cars, and visible damage. Provide a clear recovery/reset action for stuck or damaged cars.
- Preserve pedestrian routes and workstations. Decide the drivable boundaries and safe parking/return positions before enabling movement.

## Shared state

- Use the existing server/world connection. The server owns car position, velocity, damage, and control ownership; clients send input and render interpolated movement.
- Allow a signed-out browser to request temporary control of one unoccupied car through a server-issued visitor identity. Expire control on disconnect or inactivity, and resolve simultaneous requests predictably.
- Replicate bounded collision and tire-mark events. Late joiners receive current cars, damage, ownership, and recent marks; cap counts and lifetime to keep long sessions and phones responsive.
- Define collision behavior and damage recovery before implementation. Verify that client prediction and server correction do not create apparent hits, duplicate damage, or teleporting cars.

## First implementation slice

1. Confirm the connected garage ramp and exterior driving area with one car, a terrain-following camera, and a collision map.
2. Prove two browsers agree on ownership and movement, including an anonymous driver and a late-joining viewer.
3. Add and tune the four handling profiles, drift feedback, collisions, recoverable damage, and replicated tire marks.
4. Check mouse/keyboard and touch controls, disconnect recovery, simultaneous entry, mobile performance, and working-agent/pedestrian behavior.

The archived single-player experiment in `experiments/motorclub/` is reference material for models, camera and handling ideas. Review each reusable part; do not restore its standalone racing interface or assume its local physics already satisfy shared-world requirements.
