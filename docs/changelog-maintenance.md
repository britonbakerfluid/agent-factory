# Updating What's New

The in-app preview, history modal, and repository changelog share the curated entries in `client/prototypes/factory25dChangelog.ts`.

For a release, add a new entry at the top with a stable unique ID, its date, a short title and summary, two or three user-facing highlights, and supporting PR numbers. Each highlight has a short `label` and a `text` sentence; the label is bold in both the app and generated Markdown. An original historical entry can cite `commits` when no PR exists. Keep small fixes grouped into their feature release. Avoid internal refactors and commit-message dumps. The newest entry supplies the preview; a new ID lights the unread dot. Opening the preview marks that ID seen in this browser, but the history stays accessible. Storage failures do not block the UI.

Run `pnpm exec tsx scripts/generate-changelog.ts` to refresh `CHANGELOG.md`. The initial historical dates are merge dates, not verified deployment timestamps. Do not label future entries live before they ship.

The current preview action navigates to the patio. When the featured update changes, update the action label and callback in `factory25dWhatsNew.ts` / `factory25dSlice.ts` to match.

Add a static screenshot and its native width/height to `factory25dReleaseArtwork.ts`. It supplies the full image and the thumbnail visible beside each older release. Avoid decorative renders that do not demonstrate the feature. Historical release imagery is captured from isolated checkouts of the release commits. See `docs/evidence/changelog/README.md` for source commits and capture settings, including the original factory and current gameplay illustration. Capture the game canvas at its native aspect ratio; do not include page gutters or stretch the scene. These are reconstructed release views with sample agents, not archived live-session photographs. Document current gameplay illustrations separately from historical captures.
