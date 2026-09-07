# Clickable lights and vending sound

Click a lamp, candle, neon sign or outdoor fixture to toggle its actual light and luminous surfaces. A small rear-wall rocker controls the main room's cutaway ceiling lights. The garage wall fixtures share an overhead circuit; its reading lamp and workbench remain independent. Patio lanterns, canopy lamps, string runs and fire bowl have independent switches, with stair strips on the first stair lantern's circuit. Daylight and weather illumination retain their existing behavior. Rain can suppress the fire while its switch is on; an extinguished fire stays off when the weather clears.

Switches expose keyboard-accessible pressed states, follow their physical prop through the current camera, and hide during room transitions and dialogs. Shared circuits accept clicks on each physical fixture. Nearby projected targets resolve clicks between the phone and candle. Choices persist on this browser only in `factory-light-switches-v1`, with graceful fallback when storage is unavailable. Ceiling lighting follows day/night until manually switched.

The vending machine now has a selection beep, dispensing motor/rattle, and first-contact clunk. Lamp switches and candles have short matching cues. Procedural buffers use the existing opt-in sound/volume mixer; there are no new downloads or audio contexts. Cooldowns and a six-voice cap bound rapid input. Muting or hiding cancels unfinished sounds.

Validation: client/server build and 691 tests across 104 files pass. Functional checks cover switch persistence through time/weather updates, independent illumination, extinguished candle animation, private material cleanup, and sound event/voice lifecycle. Browser review verified room/candle toggles, actual illumination changes, clicking both candle and adjacent phone, a non-primary garage fixture controlling the shared circuit, persistence across reload, and 44px targets at 390×844 with no horizontal overflow. Sound opt-in initialized successfully with no browser errors. Audio timbre and physical-phone performance were not independently evaluated.

Screenshots: [lights on](evidence/lights-on.png), [lights off](evidence/lights-off.png).
