# Brand shelf

The small front-counter artifact shelf and outdoor WE flag open the same in-room logo library. It follows the factory's dark green panels and bottom room-return dock. Native modal focus keeps keyboard walking and other room controls out of the library; search, brand filters and downloads work with touch and keyboard. Closing restores the current room and trigger focus.

The first collection contains eight original SVGs, not an exhaustive company asset archive:

- Fluid full logo and symbol, white.
- We Commerce full signature, wordmark and symbol, each black and white.

The source is `apps/design-system-showcase/src/assets/brand/` in the local `fluid-mono` checkout. All eight are byte-identical to the corresponding files in the Desktop `brand assets` folder. The two desktop Fluid filenames were `FLUID-Logo (3) 1.svg` and `FLUID-Logo.svg`; We Commerce files used `Property 1=<variant>-<tone>.svg`. Public filenames now describe the actual identity and variant. Existing artwork, colors, clear space, trademark and signature details are preserved. No AI-generated logo substitutions.

`client/assets/brand/manifest.json` records source labels and SHA-256 hashes. Only these selected self-contained logo files are served; the app does not browse anyone's local filesystem. Original SVG download links preserve bytes. PNGs are generated on demand at a maximum edge of 2048 pixels, maintaining aspect and transparency. The ZIP contains the same eight originals and manifest. No account or new service is required. Do not put confidential presentations or internal documents into this public collection.

To add a verified asset: copy its original export to `client/assets/brand`, add descriptive metadata in `factory25dBrandAssets.ts`, update manifest/hash and rebuild the ZIP. Keep the bundle and catalog in sync. Local absolute source paths are not included in public metadata.

The real cloth flag adapts Briton's personal flag project: black notched silhouette, the WE mark, pinned pole edge, weather-driven gusts and curling folds. See `personal-flag-source.md` for source provenance. Reduced-motion preferences select a static drape. The shelf matches the original plant shelf's 1.25 × .5m footprint, 1.45m green metal frame and three wooden shelves. Small brand artifacts include an extruded Fluid symbol built from its original SVG paths, a postcard, mug, enamel badge, identity cards, folded tee and print rolls. The shared walking layout includes the shelf footprint. The shelf and flag remain physical scene objects; their labels follow the current camera. The library adds no network sends or state changes to other people's agents.
