# Walking between rooms

While controlling an owned agent, walk toward the back wall into either passenger elevator. Its doors open on approach; the agent walks inside, rides to the other floor, and walks out with the control lease intact. Movement resumes on arrival. Walking through the right-hand patio doorway also brings the camera along; return through the same opening to come inside.

The server authorizes elevator entry at the physical doorway and owns the 1.77-second trip. Clients render entry, a concealed passenger during transit, and exit using that timeline. Reduced motion keeps the same passenger timing with no camera lift. Release, disconnect, session ending, ownership changes, and browser takeover settle at a safe door. Held directions cannot cause an immediate return ride.

Camera following reacts to the controlled agent crossing rooms. It does not continually pull the camera back when a viewer uses room navigation to look elsewhere. Workstation placement and ordinary viewing remain separate actions.

Local review: `/prototype-25d-slice.html?controlsPreview=travel`. Take control, then use W/A/S/D or the on-screen movement buttons. The local playground's **by elevator** and **by patio door** buttons place the sample at those entrances for quick checks, without live writes. The normal connected experience requires this server and client update together.

Validation: manual elevator geometry and lease tests, preview transport tests, room following and passenger rendering tests, existing room navigation/path tests, client/server build, and desktop/mobile viewport walkthroughs.
