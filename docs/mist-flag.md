# Interactive Mist flag comparison

The original black WE swallowtail remains at the patio's back railing. A pale
rectangular Mist flag stands immediately to its left, at the same pole height.
The second flag has length-preserving horizontal folds, a pinned hoist, free
corner sag, lit normals, shadows, a fabric weave and a stitched hem. Cloth motion
advances at 15 fps; the ink animation advances at 30 fps. This is an art-directed
cloth approximation, not a cloth collision simulation.

The ink uses Briton Baker's original interactive canvas engine from
`/Users/britonbaker/Downloads/mist.html`, titled **Mist**, found on 2026-09-06.
Source SHA-256: `5845f8b6ebe14c9082df4b9a408852344e58b72b4bb7cc3b46c7ab8dd767f676`.
The copy is consistent with the previously inspected downloaded reference; the
exact title “Fluid Mist logo lab” and delivery to Jonathan were not confirmed.
This is private user-owned brand source, not a new third-party open-source asset.

`client/prototypes/vendor/mistLogo.js` retains the authored 90-column RLE shape,
renderer, seeded motion, pointer springs, click blow and automatic reassembly.
The only integration adaptations are an exported/scoped custom element,
reconnection guard, DPR 1 for its texture raster, and an explicit `advance(dt)`
clock instead of a separate requestAnimationFrame loop. Sound is off. The
original local source file is unchanged. Its presentation margin is cropped
uniformly when painting onto the fabric; its geometry and particle math are not
redrawn or stretched.

Actual ray hits on the deformed cloth supply UV coordinates, then the same crop
maps them into the original canvas's `stir` API. Pointer leave calls `unstir`;
click/tap or keyboard activation calls `blow`. Drags do not scatter the logo.
The WE flag keeps its existing brand-shelf action. Mist works in the patio's
normal and inspect views; hidden rooms, background tabs and offscreen ink stop
advancing. Reduced motion freezes both cloth and ink and omits the scatter
button. All new resources, source DOM and pointer listeners dispose on HMR.

Validation includes pinned-edge/strip-length/clearance properties, stepped and
reduced motion, ray hits from both faces and the exact crop coordinate mapping.
