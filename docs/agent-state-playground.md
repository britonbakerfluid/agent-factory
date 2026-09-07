# Agent state playground

Open [the local state editor](http://localhost:5173/prototype-25d-slice.html?controlsPreview=activity). It uses one sample at a real workstation and the same avatar renderer, bubbles, workstation feedback and personal attention UI as the factory. It sends no live actions. The editor is development-only; presentation and attention handling are production code.

Choose any of the 15 states to tune its standing/working/sitting pose, frame rate, bubble symbol or short message, and color. Defaults are real presets, not example text. Changes are saved per state in this browser; **reset this look** restores that state. They do not change server activity or anybody else's appearance preferences. Walking, manual control, emotes, elevator travel and car/laptop interactions retain their physical pose priority. Reduced motion freezes the stationary animation.

**Play a turn** demonstrates thinking → reading → writing → running → needs input → thinking → ready. Choosing a state, editing its look, resetting or leaving the scenario cancels the demo. The demonstration's input is simulated; real requests are never answered by the scene.

| States | Default treatment |
| --- | --- |
| Thinking, planning, compacting | Standing, slow motion, distinct compact symbols |
| Reading, writing, running, searching, chatting | Working, state-specific speed and symbol; hover shows exact tool |
| Waiting without a reason | Neutral waiting marker; no personal needs-input alert |
| Needs input / approval | Persistent amber message, standing pose, personal needs-you count |
| Ready for review | Green completion message and separate ready count |
| Error | Coral issue message; not a claim that the agent is blocked |
| Idle / stopped | Quiet resting or ended appearance |

`factory25dAgentStates.ts` contains the shared state resolver, presentation machine and style presets. `factory25dActivityFeedback.ts` uses it for bubbles and station color, and `factory25dLiveAgents.ts` uses it for stationary poses and timing. Transient warnings yield to resumed work; their latest detail remains available in the existing name popup.

The agents bar shows updates only for the authenticated owner's sessions. It distinguishes requests, issues and completed turns; **find agent** visits the current room without taking control. Requests remain until actual activity resumes, counts pause when disconnected, and repeated snapshots/reconnects do not repeat announcements. These are in-page cues with polite accessibility announcements, not operating-system notifications or sounds.

See [attention signal sources](agent-attention-signals.md) for which events establish each state, reconnect persistence, Codex/Claude coverage and legacy installer limits. Complete live behavior requires deploying the matching server and client; the normal local preview currently reads the older shared host. The state editor exercises the complete feature immediately.

Validation includes state coverage and precedence, bounded saved settings, preview isolation and timer cancellation, owned-agent filtering and episode deduplication, real hook transitions, and persisted snapshot round trips. Native evidence: [writing with a short bubble](evidence/agent-state-writing.png), [pending input and personal update](evidence/agent-state-input.png). The writing capture uses an editor-selected short message; its default compact symbol was restored after capture.

Final local validation passed: 624 tests across 92 files, production client/server build and whitespace check. Browser review verified distinct needs-input, issue and ready counts, find-agent without taking control, a complete sample turn returning to ready, and the [390×844 editor](evidence/agent-state-editor-mobile.png) with the character visible above its scrolling controls. Viewport size and test-only style changes were reset afterward. No live deployment or operating-system notification configuration was changed.
