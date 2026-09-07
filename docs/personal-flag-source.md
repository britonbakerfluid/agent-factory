# Personal WE flag

The patio flag replaces the generic blue Fluid rectangle with the user's own black, notched WE flag. Its black pole is on the left, with a round finial and the flag extending right. The reference was viewed before implementation:

`/Users/britonbaker/Documents/Portfolio-Candidate-Audit/09-fluid-experiments-audit/06-personal-flags-material-lab/flag-mid.png`

## Original source

Read-only local checkout:

`/Users/britonbaker/Documents/Codex/2026-06-03/i-want-to-set-up-a/flags`

GitHub copy verified at `https://github.com/britonbakerfluid/flags` (private). The older local origin URL `britonbaker/flags` no longer resolves. The GitHub and local editor files differ, but their `pseudoNoise`, `waveOffset`, `warpPoint` and `rightEdgePoints` function bodies match exactly; these are the functions used by the adaptation.

Clean source commit: `be47275d29cd4d158bfab4a36eb166895ae8e83b`.

- `index.html`: `pseudoNoise`, `waveOffset`, `warpPoint`, and the one-notch edge construction. SHA-256 `a6e4126dcc67e66cb70cae2c194b3b57991575db27f4a15d63aca442c736d8b1`.
- `flag-embed.html`: original fabric dimensions (113 × 69.5), notch depth (14), pinned left edge and white WE emblem. SHA-256 `aa075886b67cefddb3199a4b4e94f2c352b383292a917edd2bfc6b60b87738b5`.
- The existing curated `/brand/we-commerce-logomark-white.svg` supplies the authentic white artwork without redrawing it. SHA-256 `66bdac78e9a259a0e6a3283204a4ca515cd6ed68342534e40935aadc0166742d`.

## Adaptation

`factory25dBrandFlag.ts` preserves the original sum-of-sines noise, phase wobble, slow gust modulation, local jitter, squared wave envelope, cubic tip curl and rest-edge displacement. Original pixel distances convert to scene metres. Scene weather controls amplitude and speed; a modest depth component makes the same motion fold a real lit cloth surface. The original editor's interactive sliders and SVG drawing loop are not embedded.

The notch removes triangles from the mesh, so both its shadow and clickable outline have the correct missing section. Logo UVs follow the cloth, including the notch, instead of stretching a rectangular texture or moving a separate floating emblem. The pole stays at `(20.7, 0, -4.06)` with the fabric extending right into the existing patio flag area. Reduced motion uses a stable drape independent of changing time and weather.

The original project and source artwork remain unchanged. Tests cover the open notch, fixed hoist, string-light clearance, stable reduced motion, preserved artwork aspect, reused geometry and disposal.
