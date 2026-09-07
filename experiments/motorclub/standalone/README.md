# Fluid Factory garage + mountain time trial

The separate garage is now a playable single-player mountain time trial. Open **http://127.0.0.1:5186/**, select a car and choose **drive the loop**. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for controls, architecture, verification and remaining real-phone checks.

The original modeling-study notes below are retained as historical provenance; their descriptions of driving as future work are superseded by the implementation notes.

# Fluid Factory garage study

A separate local garage with four original stylized Blender car models: Porsche-inspired coupe, classic Mini Cooper, DeLorean-inspired time machine, and an F1-style racer. These are visual studies, not exact manufacturer models.

Preview: http://127.0.0.1:5186/

Click a car or its name to inspect it. Drag to orbit, scroll to zoom, Escape to return. The DeLorean has working gullwings. Wheel rotation and front steering can be previewed for each car; the Porsche paint can change. Day/evening and pixel rendering controls help compare the factory style.

## Isolation and provenance

Everything authored in this task is in `/Users/britonbaker/Code/agent-factory-garage-study`. No existing factory source files were edited, and the active localhost:5173 server was not restarted. The server was verified to run from `/Users/britonbaker/Code/agent-factory-25d-preview-push` on `codex/factory-avatar-editor` when this study began. The other, older checkout is `/Users/britonbaker/Code/agent-factory-window-merge-celebrations`.

`src/reference/` contains frozen copies of the current factory's plant geometry, prop materials and contact shadow helper. They do not import from the active source tree. The font and `utah-mountains.glb` are copied from that same checkout. Reference hashes are in `evidence/reference-sha256.txt`. The mountains are rendered into a separate window texture at runtime, so their geometry stays inside the window frame.

`node_modules` was initially a local symlink; it is now an independent installation with its own lockfile. Vite uses this study's own `.vite-cache` directory. The standalone package lists the dependencies required for an independent install. No source link or factory configuration change is needed. To restart locally: run `npm run dev` in this folder.

## Editable and runtime assets

- `fluid-factory-cars.blend`: four editable source cars arranged in a row.
- `scripts/build-garage.py`: reproducible Blender 5.1.2 authoring recipe.
- `public/models/{porsche,mini,delorean,f1}.glb`: individual vehicle exports, grounded at local Y=0 and facing +Z.
- `evidence/model-report.json`: geometry counts and exported node names.

Rebuild the models with `/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-garage.py`.

Material colors are unlit source colors, with no baked sun, shadows, weather or reflections. Blender is only used during authoring. Small real bevels, quiet rough materials and broad surface normals follow the factory's sculpted props. Geometry is deliberately more detailed than a pixel sprite; the browser supplies the pixel treatment.

## Later driving integration

GLB nodes have semantic `extras` exposed as Three.js `userData`:

- `role=wheel`: four independent wheel roots; roll about local X; `radius` is included.
- `role=steering, axle=front`: two steering parents; steer about local Y. Wheel rotation is a child transform so both movements compose.
- `role=driver_socket`: driver position relative to the car.
- `role=entry_socket`: a point beside the driver door.
- `role=door, gullwing=true`: DeLorean doors; `openAxis=z` and `openAngle` control the roof hinge. Porsche/Mini door panel pivots are preliminary and do not carry the complete window assembly yet.

The bodies include wheel wells and simple cabin recesses. There is no drive simulation, collision hull, avatar boarding, shared multiplayer state, sound, suspension or track in this study. The test-loop shutter and whiteboard sketch propose a future route. No room-selection card was created; the user clarified they meant the cars.

For integration, use a new garage scene/module and lazy-load the selected car assets. Keep garage controls separate from the active room's camera/chat/avatar work. Preserve these wheel/steering/driver nodes when batching static body meshes. Profile draw calls, material count and mobile GPU cost before shipping; the first exports prioritize editable parts over final rendering cost.

Build: `npm run build`. The Vite bundle-size advisory is expected for the standalone Three.js study. This folder has no Git commit, push, deployment, or main-factory integration.
