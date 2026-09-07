# Compact web avatar editor

The existing agent controls open one modal containing an animated character
preview, three groups of appearance options, and save/cancel. It reuses the room's
character painter and the terminal avatar format. Keyboard focus stays in the
modal, room shortcuts are suppressed, and opening it releases manual control.
Walking is opt-in and respects reduced motion. Draft changes remain local until
save; failures and transient disconnects retain them for retry.

`GET /api/avatar` and `PUT /api/avatar` use the existing browser session. Writes
require the same host origin, valid appearance fields and the signed-in owner.
An owner precondition also rejects drafts loaded before an identity switch in
another tab. The request cannot select another owner. Profiles are per installation identity,
matching the existing control permissions; matching display names are not merged.

The existing libSQL database gains an `avatar_profiles` table without changing
the world snapshot schema. Each save is durable before it updates all owned live
agents through the normal world delta. It leaves activity, timing, position and
control state untouched. Saved preferences survive absent agents and restarts,
and take precedence over older terminal hook payloads. Classic installations
without a saved preference keep their previous behavior. The preceding 2.5D
build can still read the database; it ignores the additional profile table.

`agent-factory avatar` also reads and deliberately saves that same preference
through `GET` / `PUT /api/avatar/installation`, authenticated with the existing
installation credential. Successful saves update owned live agents immediately.
Stale hook payloads still cannot replace a saved look. The terminal keeps a local
copy and reports when sync fails or the server needs updating; the updated CLI
and server are both required for this sync. Custom web colors remain selectable
in the terminal rather than being reset to its closest preset.

Style indices and the 32px sprite sheet contract are unchanged. The shared painter
now layers side-view hair over the head, with distinct beard, mouth, glasses,
headwear and visible shirt-edge details for left/right walking and carrying.

Validation: 418 tests across 62 files, client/server production builds and a Linux
amd64 Docker build. Focused coverage includes authorization, origin checks,
validation, save failure/retry, concurrent saves, new/resumed sessions, database
restart and startup reconciliation. Browser QA checks desktop and 390 × 844
layouts, preview changes, cancel, failed-save retry, saved appearance after
restart and unsaved-draft retention across a temporary connection loss.
