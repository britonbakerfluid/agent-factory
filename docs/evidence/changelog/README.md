# Historical release screenshots

Captured on September 11, 2026 by running each release commit in a separate detached Git worktree. These are reconstructed release views, not photographs archived on the release date. Release dates refer to merges, not verified deployment dates.

| Image | Source commit | View |
| --- | --- | --- |
| 2026-09-05.png | `c61eb7168e0490dc655e8437326551666d81bffd` | Patio terraces |
| 2026-09-06.png | `456f107b965808c6c888ce711dfa23a75ec85e5b` | Garage |
| 2026-09-07.png | `514686a072efb7293f678f632673f9bfba1b6cbf` | Main room and staff |
| 2026-09-08.png | `0269f9f7e9f6e2502ce1ccf1fd1f1c824606b94e` | First navigation island |
| 2026-09-10.png | `469ac1609c9f3a73d24d0f5977ee92b06b8a0f37` | Main room with sample agents |

Capture settings: Chrome headless, 1400 × 987 CSS pixels (the game shell’s native 200:141 aspect ratio), device scale 1. Capture the `#slice-canvas` element directly: 1398 × 985 pixels after excluding the shell border. This excludes page gutters and shadows without cropping the game or stretching it. Run Vite from the historical checkout and open `/prototype-25d-slice.html?controlsPreview=ready`. The existing playground supplies sample agents. API requests were stubbed and WebSockets closed to keep the capture separate from live data. Scene lighting and clock reflect capture time.

Only the playground debug panel was hidden using `.factory-preview-tools { display:none !important; }`. Agent controls were collapsed through their summary button; the patio and garage were entered through their normal navigation buttons. No scene assets or historical source code were changed.

## Original factory and gameplay highlight

- `2026-03-25.png`: existing local capture copied from `artifacts/history/factory-2026-03-25.png` in the Codex project on September 12. The original detached checkout still exists at commit `501df9f` (March 25, smaller cabinets and the counter beside the lounge). The image is 1600 × 960 and shows the original 2D arcade. It was captured later, not archived on March 25; the prior capture's exact settings were not recorded. No editing was applied to the file.
- `2026-09-12-basketball.png`: a basketball shot from the current local preview, captured September 12 to illustrate the September 11 games release. Source is the working checkout based on `d790818`, including subsequent local visual polish. This is a current gameplay illustration, not a reconstruction of the September 11 release. Opened `http://localhost:5173/?controlsPreview=ready&factoryServer=local&skyTime=day&skyWeather=clear`, accepted the sample HORSE challenge, and shot with Space. The WebGL canvas was read on an animation frame during the shot at its native 800 × 564 resolution; page gutters and debug controls are outside the canvas. No scene edits, image generation, cropping, or stretching were used.

Archive rows use one capture element that expands from thumbnail to full width. Every full image and thumbnail keeps its own aspect ratio. The previous runtime Three.js basketball still life has been removed.

- `2026-09-12-basketball.webm`: recorded September 12 from the same working checkout at loopback port 5189, using the synthetic in-memory review server. Accepted the sample HORSE challenge and recorded its opponent-shot replay directly from `#slice-canvas` with MediaRecorder: VP9, 800 × 564, approximately 7.37 seconds, silent, 860,537 bytes. Includes the camera approach, shot arc, and return to the player turn. No live identities, generated artwork, or page overlays. The loop pauses offscreen, when closed, and when the document is hidden. Reduced motion uses the existing still poster.

## Feature framing

Archive artwork now uses source-pixel frames in `factory25dReleaseArtwork.ts`, preserving the original PNG files. September 10 centers the two agents; September 8 centers the navigation island; September 7 centers the whiteboard attendant to illustrate room staff (not a claim that the whiteboard first shipped that day); September 6 centers the garage cars; September 5 centers the outdoor terrace and stairs. March 25 retains the full original factory view. The same framed element is used at thumbnail and expanded sizes, without stretching.
