# Asynchronous HORSE

Click a basketball, then **challenge to HORSE** in the bottom island to choose a teammate. The roster includes offline teammates. Their invitation waits for them; accepting replays the setter's shot and enters the matching view.

## Rules used here

This is a two-player, alternating-turn HORSE variant. Choose a clear spot before setting a shot. A made set requires the opponent to match from that exact spot; a missed match adds the next letter in HORSE. A missed set passes the choice of shot to the opponent without a letter. After a match attempt, the matcher sets next whether they made or missed. Five letters loses. This alternating-set order is a house rule, not a claim that all HORSE games use it.

The same-shot principle follows the [Jr. NBA explanation](https://jr.nba.com/how-to-play-horse/). The physics simulation on the server decides whether a basket counts; the client cannot submit a made/missed flag.

## Confirmation and feedback

After a made set, the ball returns to the actual release location in the room. **Confirm challenge** submits the shot there. It cannot be relocated after proving the shot. The replay release, ground ring and required matching spot all agree. Old clients sending a different target spot are rejected without consuming the turn.

The island shows whose turn it is. While shooting it includes distance and the viewer's HORSE letters; newly earned letters also appear in the result message. No scores or handwriting are drawn on the window. The marked spot uses a solid orange pulsing ring; reduced motion keeps it still. Invited players see a local ghost ball with an accept thought bubble. The mark cannot restart a replay.

State is addressed to durable owner IDs, persisted through the world repository and sent to the participant's authenticated sockets. Seen acknowledgements do not change gameplay revisions. Invitations and stalled games expire without default wins. Older ten-shot records and malformed saved records are discarded.

## Verification

- `tests/basketball-challenge.test.ts`: rules, deterministic results, matching coordinates, confirmation validation, stale revisions, seen acknowledgements and record validation.
- `tests/basketball-challenges-server.test.ts`: authenticated dispatch, persistence/reload, limits and isolation.
- `tests/visitor-basketball.test.ts`: shot physics.
- Playground `?controlsPreview=ready&factoryServer=local`: fresh invitation with zero letters, scripted teammate that can miss sets and matches. It is isolated from live multiplayer and cannot prove real offline delivery.

Real two-account/restart browser verification still requires a running authenticated backend.
