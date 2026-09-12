# Lounge YouTube player and DJ

Click the small lounge receiver or the headphone-wearing DJ to open a visible official YouTube player. Paste a YouTube watch/short/share/music link, add it, and use the accessible up/down buttons to reorder upcoming videos. Listen opts this browser into sound. The existing sound control and music volume still apply. Closing the panel, leaving the room, hiding the browser tab or scrolling the video out of view pauses local playback. Other listeners keep their own playback; queue order and song start time are shared. No audio is extracted, downloaded or hosted.

The DJ rotates through nine official artist/label uploads, selected with America/Denver time. Daytime mixes MF DOOM’s “Doomsday,” Jon Bellion’s “All Time Low,” and Kanye West’s “Heard ’Em Say.” Evening plays “Rapp Snitch Knishes,” “Blu,” and “Everything I Am.” Overnight shifts to DOOM’s “Arrowroot,” J Dilla’s “Time: The Donut of the Heart,” and Bellion’s acoustic “Blu.” These are originals and an official acoustic recording, not generated lo-fi remixes.

Each time-of-day selection plays through all its tracks before repeating. An incoming human request immediately replaces a fallback DJ selection, but never interrupts another person's queued song. When the human queue finishes, the DJ resumes its place. Automatic selection is deterministic curation, with no AI API. Official YouTube oEmbed metadata was checked for each selection; playback availability remains controlled by the publishers and can vary by region.

The character reuses the room staff sprite renderer, with headphones, eye motion and a brief selection pose. It has no default visible name, agent session, contribution score or ticket credit. Hover describes its role; click opens the player. Reduced motion disables the nod/reach.

`radio_queue` supports add/reorder/remove/duration/skip. Queue edits require the existing authenticated browser principal and same-host origin check. Username comes from the principal. Reorder requires the current revision and an exact permutation of pending IDs. Duration and skip must identify the current entry; stale reports cannot change its successor. First valid duration wins, capped at three hours. Until a signed-in playing embed reports a duration, the server allocates a 10-minute slot (also the fallback for live streams). The shared clock continues while clients are locally paused. Queue data is process-local and resets on server restart.

Video URL parsing permits only YouTube's recognized hosts and 11-character IDs. The server fetches title/availability from a fixed official oEmbed endpoint with a five-second timeout, never from a user-supplied host. Metadata does not guarantee playback in every browser/region; the visible player explains failures and users can skip. No API key is required. Preview queue actions stay local and use the same pure queue state machine.

Official player/API requirements: https://developers.google.com/youtube/iframe_api_reference and https://developers.google.com/youtube/terms/required-minimum-functionality. Player viewport is at least 200 × 200 CSS pixels, with native controls and links unobscured. IFrame API loads only on opening the panel. No hidden background-audio player.

Verification: client/server typechecks, production build, queue/auth/URL/concurrency/timing tests, mocked official-player lifecycle tests, existing mixer/auth/control tests, and computer-use preview checks for embedding, playback, adding, reorder and skip. Shared authenticated server behavior is covered in tests; this change has not been deployed.

## Current queue and search behavior

The DJ booth contains search, playback, seek, and queue controls. The bottom island only contains the sound waveform and separate Music/SFX volume and mute controls. Muting displays zero while retaining the last audible level per channel for restoration across reloads. Blue on the waveform means sound is enabled; music motion requires active playback and SFX motion uses the local analyser.

`GET /api/radio/search?q=…` requires an authenticated browser session. Searches accept at most 200 characters, are limited per owner and IP to one per second, and contact only fixed YouTube endpoints (no redirects). Responses are bounded to 2 MB and 7 seconds. Successes are cached for 60 seconds and failures for 10 seconds in a bounded cache. Search parses balanced JSON and returns at most ten results. The endpoint may fail when YouTube changes its markup; pasting a supported video link uses oEmbed instead. `tests/radio-search.test.ts` covers authentication, limits, response bounds and parsing.

The room queue is collaborative: signed-in participants may add, reorder, remove queued entries and skip the current track. Removal requires the current queue revision, cannot remove the playing entry, and shares the authenticated queue-action throttle. This is the same membership policy as reorder, not private ownership of individual queue entries.
