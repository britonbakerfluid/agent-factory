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
