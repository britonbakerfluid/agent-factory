# Lake canoe

The existing window landscape now contains a small open terracotta canoe with wooden seats, a pale rim, paddles and a faint wake. It uses the lake's actual surface height and shoreline, with a slow 150-second circuit. Trees and terrain can occlude it; all parts share the landscape's weather haze and lighting. The hull is one merged, vertex-coloured mesh, and the paddlers use the same 0.09-unit avatar scale as the climbers.

Saved teammate appearances are allocated between the climbers and canoe without duplicating a person across those two outings. Presence polls preserve the cast and refresh changed customizations. Like climbing, canoeing is a background appearance from team history, including offline teammates; it does not claim or relocate a working session. Up to two people paddle, and an empty roster leaves a stationary empty canoe without inventing a person.

The shared pixel avatar painter supplies four paddling poses, cropped at the lap so legs stay inside the hull. Animation pauses when the landscape is hidden. Reduced motion holds a still pose and removes the moving wake and bobbing. The canoe hides at night, during substantial rain, during snowfall and during thunderstorms.

Validation covers the complete hull and wake staying inside the shoreline, ground clearance, distinct visitor allocation, appearance updates and resource disposal, shared haze, weather changes and offscreen/reduced-motion behavior. A geometric sightline check also checks the real landscape from the window camera direction; brief tree occlusions are intentional.
