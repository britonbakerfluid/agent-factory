# Lounge phone message arrivals

The phone responds to a new incoming `chat_append` in the ordered factory delta stream. A brief 220ms handset vibration accompanies a single screen-brightness pulse and soft blue light on the table, fading out after 1.45 seconds. Messages in the same brief burst share that pulse; there is no repeating alert or queued replay.

Initial history, reconnect snapshots, repeated deltas, duplicate message echoes, the current viewer's outgoing messages, and local system/command responses stay quiet. The detector listens to the same accepted connection events as the rest of the factory; it does not open a connection or send a message.

The cue only plays while the main room is visible and the phone is closed. Arrivals while reading the phone, viewing another room, disconnected, or in a hidden tab are consumed without a later alert. Opening the phone or leaving the view cancels an unfinished cue. Reduced motion keeps the handset stationary and retains the gentle screen pulse.

The 240ms procedural buzz runs through the existing opt-in sound mixer and volume setting. It creates no audio context or asset request on its own. Sound off, zero volume, hidden-tab handling, and disposal stop unfinished audio; re-enabling sound does not replay it. `stopPhoneBuzz()` cancels only the phone sound, preserving another prop effect already playing.

The scene integration is `loungeDetails.chat.configureNotifications({ buzz: sceneAudio.phoneBuzz, stop: sceneAudio.stopPhoneBuzz })`.

## Local review

Open `prototype-25d-slice.html?controlsPreview=travel&skyTime=night`, expand **local playground**, and select **receive sample message** while the normal room is visible. The button supplies a local snapshot baseline followed by a real append event and updates the in-memory conversation. It never sends a network message. Open the phone to inspect the sample message; using the button again while the phone is open should not vibrate it.

Focused validation covers message identity and revision ordering, reconnects, own echoes, hidden-view consumption, reduced motion, cancellation, shared audio gating, and unchanged phone framing/chat commands. The focused set passed 41 tests, along with the client typecheck and diff check.
