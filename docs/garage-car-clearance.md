# Garage car clearance

Measured from the actual GLB vertices and node transforms, 2026-09-06. These are scene units, not real-world vehicle dimensions. This validates reserved maneuvering space; driving is not implemented or enabled.

Reproduce with `node scripts/check-garage-clearance.mjs`. The script reads the shared car scale, yaw and bays; loads all four GLBs with Three.js; measures the canonical avatar painter; and checks transformed convex hulls through 2,905 poses per car. It writes no artifacts. Ramp/furniture dimensions in the script describe the current garage art and must be updated if that art moves.

## Scale and parked footprints

Use car scale **0.75**, leaving the canonical agent at world scale **1**. At the previous 1.4 scale, cars were 1.38–1.64 tall versus the default agent's 0.7525 painted height. Porsche, DeLorean and F1 were wider than the ramp's 1.91 clear opening. At 0.75:

| Car | Width | Height | Length | Parked relative x bounds | Parked relative z bounds |
| --- | ---: | ---: | ---: | --- | --- |
| Porsche | 1.0733 | 0.8033 | 2.0513 | −0.8272…0.8463 | −1.0912…1.0192 |
| Mini | 0.8963 | 0.8775 | 1.6196 | −0.6833…0.6908 | −0.8658…0.8564 |
| DeLorean | 1.1033 | 0.7407 | 2.0910 | −0.8543…0.8832 | −1.1196…1.0803 |
| F1 | 1.3815 | 0.7388 | 2.2988 | −1.0457…1.1069 | −1.3371…1.1604 |

Width/length follow each car's axes. Parked bounds include yaw `π − .52` and are relative to bay centers `x = [−4.6, −.4, 3.8, 8]`, local `z = .25`. Add the bay coordinates, then the pedestrian clearance margin, for navigation boxes. Keep the current 4.2 center spacing: the smallest gap between parallel open-door envelopes is over 2.1 units. No bay movement is necessary.

## Doors and driver

Porsche and Mini exported y-axis door angles swing inward. Negate those angles at runtime: left Porsche **+.85**, left Mini **+.95**, mirrored on the right. DeLorean gullwing z signs are already correct; left **−1.1**. F1 has an open cockpit.

| Car | Driver socket, unscaled local xyz | Left-door sweep minimum x at .75 | Additional entry offset along local −x, in world units |
| --- | --- | ---: | ---: |
| Porsche | (−.1736, .57, −.10) | −.7313 | .30 |
| Mini | (−.182, .56, −.07) | −.7591 | .30 |
| DeLorean | (−.2128, .57, −.07) | −.6475 | .15 |
| F1 | (0, .52, 0) | No door | .35 |

The original Porsche/Mini entry sockets clear the open door tips by only .017/.010, so the offsets reserve space for the person. Divide the world offset by .75 when applying it before the car transform. DeLorean's fully open door reaches height .9457 above its model origin.

Anchor the seated sprite **center** to `driver_socket`, preserving avatar world scale 1. The socket is not a new floor: adding the existing feet offset a second time raises the person through the roof. Including the car root y=.025, seated center heights are .4525/.445/.4525/.415 above the garage floor. The default sit sprite is .725625 high and extends .3225 above center. Its resulting top is .775/.7675/.775/.7375; the stylized DeLorean head may protrude about .009 above its roof. Lower body pixels are occluded by the car body. Custom hats still need visual inspection.

## A complete clear maneuver

All cars face local +Z; their parked nose points toward the back-right. Reverse **11.012506** units along the bay heading, then stop and drive a radius **2.2** right turn to face +X. This long reverse uses the open middle and avoids steering back into the parked row.

| Car | End of straight reverse (x,z) | End of first forward arc, facing +X (x,z) |
| --- | --- | --- |
| Porsche | (−10.071895, 9.806864) | (−8.162693, 8.7) |
| Mini | (−5.871895, 9.806864) | (−3.962693, 8.7) |
| DeLorean | (−1.671895, 9.806864) | (.237307, 8.7) |
| F1 | (2.528105, 9.806864) | (4.437307, 8.7) |

Continue east along z=8.7 to **(8.615, 8.7)**. A radius **2.2** left quarter-turn ends at **(10.815, 6.5)** facing −Z. Straighten, then enter the ramp along x=10.815.

The sampled closed-car hulls clear the other three parked cars, front furniture, rear desks, shelf, lounge, sidewalls and ramp curbs for every car. The F1 is limiting: during the final turn its sweep reaches x=11.649913, leaving **.160087** to the sidewall's inner face x=11.81. Its nearest point to the lounge is z=9.518164, leaving about **1.47**. It finishes turning before reaching the curb's front edge. Once straight, F1 has **.26425 per side** between curbs. No ramp widening is required at .75; reserve this aisle from future props.

## Limits before actual driving

The route is a geometric feasibility check at low speed, using the car origin as the path reference. It is not a tested steering controller, tire model or continuous collision solver. It assumes closed doors, stationary parked cars and no pedestrians crossing the maneuver; a runtime driver must yield to agents.

The ramp rises 1.25 over 9.3 (7.655°), with portal headroom about **1.57**. Scaled cars fit that opening, but the current ramp has a sharp base/crest and no completed exterior continuation. F1's flat-floor underside is only **.091875** above its tire contact plane. Before any driving ships, construct a proper upper landing/exit and validate wheel contact, pitch, underside and front-wing clearance through both slope transitions. The automated route deliberately stops before the crest at center z=−2.5.
