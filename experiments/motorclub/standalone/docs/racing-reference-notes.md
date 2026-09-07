# Racing reference: garage first

Research date: 2026-09-05. These are design recommendations, not implemented changes. The user confirmed the downstairs garage is the priority; racing remains an optional activity.

## What to borrow

Rocket Racing's official gameplay references separate race progress, vehicle feedback, and world action. Its Speed Run mode specifically centers on best lap time. For our single-player loop, the useful lesson is information hierarchy rather than copying the futuristic graphics. [Official gameplay article and screenshots](https://www.fortnite.com/news/race-without-limits-with-rocket-racing-in-fortnite), [Speed Run announcement](https://www.fortnite.com/news/set-a-speed-run-record-in-rocket-racing-v28-30).

1. Keep the factory's existing pixel-island shape, font, button faces, and cyan selection. During a drive, make current time dominant and personal best smaller; speed and drift charge are secondary.
2. Keep the center of the scene clear. Put pause/return/reset in the existing bottom dock, and reveal a short drift indicator only during charge or boost. Avoid several overlapping dashboard panels.
3. In the garage, prioritize the agent/workstation controls. Make driving one optional action when a car is selected; keep the personal-best display on a physical wall board where it contributes to the room.
4. Tire marks should be quiet evidence of a slide: two dark, short-lived ribbons following the rear contact patches, emitted only with actual sideways slip while touching asphalt. Cap the segment count, fade old marks, and do not emit across resets or airborne gaps. This is our implementation recommendation, not a claim about Rocket Racing internals.
5. Improve distant depth with two or three low-detail mountain ridges outside the playable terrain, overlapping silhouettes, a middle-distance tree belt, and a sky-colored haze that starts beyond the nearby road. Preserve saturated, dark near-field greens and rocks; only distant layers lose contrast. This is our low-cost interpretation of atmospheric perspective, not a requirement to adopt Unreal's renderer. [Epic atmosphere reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine).

## Scenery implementation boundary

Use the existing sculpted mountain shapes and palette for simplified ridge meshes. Their purpose is a continuous horizon, with no collision or dense detail. Keep the added silhouettes inside the camera far plane and cover visible terrain edges. Blender is useful if a distinctive skyline needs art direction; procedural low-poly ridges are adequate for an initial pass.

Three.js fog fades rendered geometry toward a chosen color; match that color to the horizon background. Fog alone cannot create missing land. Its start distance should preserve clarity around the car and garage windows. Interior materials should not inherit an outdoor fog treatment. [Three.js fog manual](https://threejs.org/manual/en/fog.html).

Fix road/terrain intersections and use the same ground color treatment for road embankments before adding scenic detail. Haze will not repair z-fighting or a mismatched near-field material.

## Reference evidence

- [Official turbo gameplay screenshot](https://cdn2.unrealengine.com/rocket-racing-turbo-1920x1080-4f6456fabaa9.png)
- [Official shortcut gameplay screenshot](https://cdn2.unrealengine.com/rocket-racing-shortcut-1920x1080-f969fc6903c5.png)
- [Official Speed Run image](https://cdn2.unrealengine.com/rocket-racing-speed-run-mode-1920x1080-843f1118be0e.jpg)
- [Epic Speed Run Manager documentation](https://dev.epicgames.com/documentation/fortnite/using-rocket-racing-speed-run-manager-devices-in-unreal-editor-for-fortnite): confirms a dedicated time-trial HUD/game flow and solo start support. Our project does not need UEFN or this device.

The official turbo gameplay screenshot was also inspected in the browser: lap and standings sit at upper left, a compact speed/boost indicator sits beside the car, and the driving center stays clear. The near tree belt, distant coastline silhouette and sky make distinct depth layers. The desktop screenshot supports this hierarchy; mobile HUD layout was not verified. This is a reference for the next racing UI pass, not a claim that the HUD was rebuilt in this garage-focused pass.
