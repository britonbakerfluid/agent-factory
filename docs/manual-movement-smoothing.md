# Controlled agent movement

The server updates manual positions at 10 Hz while the scene draws every display frame. Previously the client placed each manual sprite directly at the most recent packet position. Between packets, the zero movement delta could also choose the up-facing walk frame even when the server said the agent was walking left or right.

The rendering layer now keeps a bounded 32-sample buffer and draws between confirmed positions with a 120 ms presentation delay. Samples use server timestamps mapped to a monotonic presentation clock; late packets cannot reverse animation time. The buffer stops at the last confirmed position if updates stall. It does not advance an agent through an obstacle or alter shared state.

Facing comes from explicit manual-control state. Stationary controlled avatars hold their facing and resting frame. Short corner segments use the existing safe floor path; control release, elevator animation, floor changes, and large relocations reset the buffer instead of interpolating through walls or between floors. Local travel previews now use the same walking speed as the server.

A brief interpolation underrun holds the existing walking frame for at most 120 ms while the latest authoritative state still says moving. Position remains clamped to the last sample and the gait does not advance without distance. A stopped packet or longer stall clears the hold, preventing the repeated standing-frame flicker between updates.

The B shortcut and emote button still open the full emote loadout, displayed as a compact bar in the 2.5D view. B and WASD now also work after clicking a control button. Typing and native button activation remain separate.

## Game-development references

- [Glenn Fiedler: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) explains how buffering confirmed positions hides irregular packet timing without raising network traffic.
- [Gabriel Gambetta: Entity Interpolation](https://gabrielgambetta.com/entity-interpolation.html) describes drawing between server snapshots to remove visible teleporting between low-frequency updates.
- [Gabriel Gambetta: Client-Side Prediction and Server Reconciliation](https://gabrielgambetta.com/client-side-prediction-server-reconciliation.html) describes the separate response-latency problem. This pass addresses visible jitter; it does not claim input prediction. Shared driving should introduce acknowledged input replay and server reconciliation when it adds its new movement protocol.

Validation covers 60/144 Hz rendering from 10 Hz samples, uneven packet arrival, stalls, starting after idle, stops/facing, stale samples, safe corner paths, control release, elevator resets, and floor changes.
