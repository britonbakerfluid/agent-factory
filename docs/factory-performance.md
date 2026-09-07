# Factory geometry audit

Source counts from the current local scene, including the number of placed instances. These are triangles and estimated colour drawing commands before camera culling, transparent double passes and shadow passes. They are not measured frame times. The full reproducible census is in [factory-geometry-counts.json](evidence/factory-geometry-counts.json); run `node --import tsx scripts/audit-factory-geometry.mjs` to refresh it.

| Model or group | Triangles |
| --- | ---: |
| Patio planters' groundcover leaves, full detail | 171,152 |
| Current terrain surface | 101,200 |
| Two patio pines' needle canopies together | 43,200 |
| One indoor palm's foliage and stems | 13,752 |
| Mini Cooper | 11,972 |
| Porsche | 11,920 |
| One indoor bonsai's foliage and stems | 11,820 |
| DeLorean | 11,410 |
| One indoor fern's foliage and stems | 10,752 |
| F1 | 7,968 |
| Hanging pothos, complete | 5,568 |

The procedural window landscape totals 121,868 triangles. The optional Blender terrain asset has 18,062 triangles but is not the default landscape, so its count does not describe the current mountains. The four car files total 43,270 triangles and 335 primitives. Their many small material parts are a batching opportunity; the wheel, door, steering, seat and laptop attachment nodes must remain intact.

## Changes made

- The patio's dense groundcover uses a 36-triangle solid leaf at the normal view, instead of the 76-triangle beveled leaf. It keeps the outline, front/back surface depths, vein, colour, instance placement and count. The canonical leaf returns before inspection zoom settles. Hysteresis prevents repeated switching near the threshold, and snow follows the same detail choice. The entire dry patio terrace drops from 322,718 to 232,638 triangles: 90,080 fewer, about 28%. Full inspection detail remains 322,718.
- The hanging pothos instances leaves and veins per animated vine. It drops from 120 to 24 colour drawing commands while retaining all 5,568 triangles. Comparing the pre-change model at three moving poses and reduced motion matched all 120 constituent parts, original vertex positions and normals, colours and shadow flags. Maximum transform difference was below 0.00000006 units, from instance-buffer precision.

## Next measurements and candidates

1. Profile frame times on desktop and a physical phone in the factory, patio, garage and storm weather. The Mac was locked during this audit, so browser visual review and live CPU/GPU timing remain pending; no FPS improvement is claimed.
2. Measure the cloud shader and shadow passes separately. Clouds are a screen quad but use 28 ray steps and three additional density samples for lighting at occupied steps; triangle count cannot represent their cost. They already render at 640 pixels wide and about 12 Hz and skip offscreen work. Adaptive cloud resolution may be more useful than cutting small props.
3. Batch static car trim within material and motion groups, preserving every animated hinge and socket. Avoid combining transparent glass into opaque paint batches.
4. Investigate an error-bounded lower-detail terrain mesh for the normal window view, retaining the current mesh for close inspection. Preserve ridge silhouettes, analytic normals, shoreline and vegetation grounding; do not replace the current art-directed terrain solely because the optional asset has fewer triangles.
5. Skip decorative plant transform updates when their room is not rendered. Avoid pausing shared agent, chat, control or driving state along with the visuals.

Checks cover closed solid low-detail leaves, subpixel outline differences at normal room scale, attached vein depth, restored detail and snow on zoom, unchanged foliage poses/colours, switching hysteresis and the hanging plant's geometry/drawing budget. Actual visual comparison, shadow appearance and performance on a physical mobile device still need checking.
