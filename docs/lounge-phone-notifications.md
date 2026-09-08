# Lounge phone message arrivals

The phone responds to a new incoming `chat_append` in the ordered factory delta stream. Two short rigid-body rattles lift and rock the handset, with pixel-friendly motion marks, a screen-brightness pulse, and soft blue light on the table. It settles in 610ms; the glow fades after 1.45 seconds. Busy conversations trigger at most one immediate cue every eight seconds, without queuing the intervening messages.

Initial history, reconnect snapshots, repeated deltas, duplicate message echoes, the current viewer's outgoing messages, and local system/command responses stay quiet. The detector listens to the same accepted connection events as the rest of the factory; it does not open a connection or send a message.

Unread live messages can prompt three occasional reminders: after 45 seconds, another 90 seconds, and another 150 seconds. Opening the phone clears them. A new incoming message starts a fresh schedule; initial history and reconnect history never create unread reminders. Messages received while the phone is open count as read.

Cues only play while connected, in the visible main room, with the phone closed. Leaving the room, hiding the tab, or disconnecting cancels unfinished motion and audio and pauses reminders. Returning waits a full reminder interval rather than playing a backlog. Reduced motion keeps the handset and motion marks stationary/hidden and retains the gentle screen pulse. The schedule uses the existing animation loop, with no timers or extra connections.

The two-pulse 610ms procedural buzz runs through the existing opt-in sound mixer and volume setting. It creates no audio context or asset request on its own. Sound off, zero volume, hidden-tab handling, and disposal stop unfinished audio; re-enabling sound does not replay it. `stopPhoneBuzz()` cancels only the phone sound, preserving another prop effect already playing.

The scene integration is `loungeDetails.chat.configureNotifications({ buzz: sceneAudio.phoneBuzz, stop: sceneAudio.stopPhoneBuzz })`.

## Local review

Open `prototype-25d-slice.html?controlsPreview=travel&skyTime=night`, expand **local playground**, and select **receive sample message** while the normal room is visible. The button supplies a local snapshot baseline followed by a real append event and updates the in-memory conversation. It never sends a network message. Open the phone to inspect the sample message; using the button again while the phone is open should not vibrate it.

Focused validation covers message identity and revision ordering, reconnects, own echoes, unread reminder spacing and limits, hidden-view pause/resume, reduced motion, cancellation, shared audio gating, and unchanged phone framing/chat commands.
