import { describe, expect, it } from 'vitest';
import { BasketballChallengeBook, HORSE_INVITE_TTL_MS, HORSE_RESULT_TTL_MS, HORSE_TURN_TTL_MS, describeChallenge, horseCanShoot, horseLetters, readChallenge,
  simulateChallengeShot, validHorseSpot, type HorseGame } from '../shared/basketball-challenge';
import { DJ_BOOTH, INTERIOR_Z } from '../shared/factory25d-layout';
import { VISITOR_BALL_RIM, visitorShotVelocity } from '../shared/visitor-basketball';

const alice = { ownerId: 'alice', name: 'Alice' }, bob = { ownerId: 'bob', name: 'Bob' };
const spotA = { x: 1.3, y: 1.05, z: -3.0 }, spotB = { x: -1.0, y: 1.05, z: -2.6 };
const make = (spot: { x: number; y: number; z: number }) => visitorShotVelocity(spot);
const miss = (spot: { x: number; y: number; z: number }) => visitorShotVelocity(spot, { ...VISITOR_BALL_RIM, x: VISITOR_BALL_RIM.x + 1.2 });
const rev = (book: BasketballChallengeBook, id: string) => book.get(id)!.revision;

function start(now = 1000) {
  const book = new BasketballChallengeBook();
  const id = book.create(alice, bob, now).id!;
  return { book, id };
}

describe('asynchronous HORSE', () => {
  it('replays releases deterministically and knows which floor spots are clear', () => {
    expect(simulateChallengeShot(spotA, make(spotA))).toBe(true);
    expect(simulateChallengeShot(spotA, miss(spotA))).toBe(false);
    expect(validHorseSpot(spotA)).toBe(true);
    expect(validHorseSpot({ ...spotA, y: .4 })).toBe(false);
    expect(validHorseSpot({ x: DJ_BOOTH.x, y: 1.05, z: DJ_BOOTH.z - INTERIOR_Z })).toBe(false);
    expect(validHorseSpot({ x: 9, y: 1.05, z: 0 })).toBe(false);
  });
  it('lets the challenger set before the invite is answered, delivers the spot to match, and alternates turns', () => {
    const { book, id } = start();
    let game = book.get(id)!;
    expect(game.status).toBe('pending'); expect(horseCanShoot(game, 'alice')).toBe(true); expect(horseCanShoot(game, 'bob')).toBe(false);
    expect(book.shot(id, 'alice', rev(book, id), spotA, make(spotA), 2000)).toMatchObject({ success: true, made: true });
    game = book.get(id)!;
    expect(game.turn).toEqual({ shooter: 'bob', role: 'match', spot: { x: spotA.x, z: spotA.z }, setBy: 'alice' });
    expect(describeChallenge(game, 'bob')).toBe('Alice challenged you to HORSE and set a shot');
    expect(game.lastShot?.release).toEqual({ position: spotA, velocity: make(spotA) });
    const persisted = JSON.parse(JSON.stringify(game));
    expect(readChallenge(persisted)).toBe(true);
    expect(simulateChallengeShot(persisted.lastShot.release.position, persisted.lastShot.release.velocity)).toBe(game.lastShot?.made);
    persisted.lastShot.release.velocity.x = 'invalid';
    expect(readChallenge(persisted)).toBe(false);
    delete persisted.lastShot.release;
    expect(readChallenge(persisted)).toBe(true);
    expect(book.shot(id, 'bob', rev(book, id), spotA, make(spotA), 2500).error).toMatch(/Accept/);
    expect(book.respond(id, 'bob', true, 3000).success).toBe(true);
    game = book.get(id)!; expect(game.status).toBe('playing'); expect(game.expiresAt).toBe(3000 + HORSE_TURN_TTL_MS);
    expect(describeChallenge(game, 'bob')).toBe("match Alice's shot");
    // Bob matches from the mark: no letter, and Bob becomes the setter.
    expect(book.shot(id, 'bob', rev(book, id), { ...spotA, x: spotA.x + .05 }, make(spotA), 4000)).toMatchObject({ success: true, made: true, letter: undefined });
    game = book.get(id)!;
    expect(game.challengee.letters).toBe(0); expect(game.turn).toEqual({ shooter: 'bob', role: 'set' });
    expect(describeChallenge(game, 'alice')).toBe('Bob is setting a shot');
    // Bob's set misses: setting passes to Alice with no letter for anyone.
    expect(book.shot(id, 'bob', rev(book, id), spotB, miss(spotB), 5000)).toMatchObject({ success: true, made: false });
    game = book.get(id)!; expect(game.turn).toEqual({ shooter: 'alice', role: 'set' }); expect(game.challenger.letters + game.challengee.letters).toBe(0);
    // Alice sets and makes; Bob misses the match and takes H, then sets next.
    book.shot(id, 'alice', rev(book, id), spotB, make(spotB), 6000);
    expect(book.shot(id, 'bob', rev(book, id), spotB, miss(spotB), 7000)).toMatchObject({ success: true, made: false, letter: 'H' });
    game = book.get(id)!;
    expect(horseLetters(game.challengee)).toBe('H'); expect(game.turn).toEqual({ shooter: 'bob', role: 'set' });
    expect(game.lastShot).toMatchObject({ shooter: 'bob', made: false, spot: { x: spotB.x, z: spotB.z } });
  });
  it('rejects out-of-turn, stale, spoofed-position and unclear-spot releases without changing the game', () => {
    const { book, id } = start();
    book.shot(id, 'alice', rev(book, id), spotA, make(spotA), 2000); book.respond(id, 'bob', true, 2500);
    const before = JSON.stringify(book.get(id));
    const revision = rev(book, id);
    expect(book.shot(id, 'alice', revision, spotA, make(spotA), 3000).error).toMatch(/not your shot/);
    expect(book.shot(id, 'carol', revision, spotA, make(spotA), 3000).error).toMatch(/not your shot/);
    expect(book.shot(id, 'bob', revision - 1, spotA, make(spotA), 3000).error).toMatch(/already played/);
    expect(book.shot(id, 'bob', revision, { ...spotA, x: spotA.x + .5 }, make(spotA), 3000).error).toMatch(/marked spot/);
    expect(book.shot(id, 'bob', revision, { ...spotA, y: 2.2 }, make(spotA), 3000).error).toMatch(/marked spot/);
    expect(book.shot(id, 'bob', revision, spotA, { x: 0, y: 40, z: 0 }, 3000).error).toMatch(/out of bounds/);
    expect(JSON.stringify(book.get(id))).toBe(before);
    // A repeated delivery of the same release is refused by revision, so a shot never counts twice.
    expect(book.shot(id, 'bob', revision, spotA, make(spotA), 3100).success).toBe(true);
    expect(book.shot(id, 'bob', revision, spotA, make(spotA), 3200).error).toMatch(/already played/);
    expect(book.shot(id, 'bob', rev(book, id), { x: DJ_BOOTH.x, y: 1.05, z: DJ_BOOTH.z - INTERIOR_Z }, make(spotA), 3300).error).toMatch(/clear spot/);
  });
  it('ends the game when a player reaches five letters and names the other the winner', () => {
    const { book, id } = start();
    book.respond(id, 'bob', true, 1500);
    for (let round = 0; round < 5; round++) {
      // Alice sets and makes; Bob misses the match and takes a letter, then sets and misses to hand setting back.
      expect(book.shot(id, 'alice', rev(book, id), spotA, make(spotA), 2000 + round * 100).success).toBe(true);
      expect(book.shot(id, 'bob', rev(book, id), spotA, miss(spotA), 2010 + round * 100).letter).toBe('HORSE'[round]);
      if (round < 4) expect(book.shot(id, 'bob', rev(book, id), spotB, miss(spotB), 2020 + round * 100).success).toBe(true);
    }
    const game = book.get(id)!;
    expect(game.status).toBe('complete'); expect(game.winnerId).toBe('alice'); expect(horseLetters(game.challengee)).toBe('HORSE');
    expect(describeChallenge(game, 'alice')).toBe('Game over · you won HORSE');
    expect(book.shot(id, 'bob', rev(book, id), spotB, make(spotB), 3000).error).toMatch(/over/);
  });
  it('limits self, legacy, duplicate-pair and excessive outgoing challenges, and allows cancel and decline only while pending', () => {
    const book = new BasketballChallengeBook();
    expect(book.create(alice, alice, 1).error).toMatch(/someone else/);
    expect(book.create(alice, { ownerId: 'legacy:Cass', name: 'Cass' }, 1).error).toMatch(/cannot play/);
    const first = book.create(alice, bob, 1).id!;
    expect(book.create(bob, alice, 2).error).toMatch(/already have a game/);
    expect(book.create(alice, { ownerId: 'c', name: 'C' }, 3).success).toBe(true);
    expect(book.create(alice, { ownerId: 'd', name: 'D' }, 4).success).toBe(true);
    expect(book.create(alice, { ownerId: 'e', name: 'E' }, 5).error).toMatch(/3 challenges waiting/);
    expect(book.cancel(first, 'bob', 6).success).toBe(false);
    expect(book.respond(first, 'bob', false, 7).success).toBe(true);
    expect(book.get(first)!.status).toBe('declined');
    const second = book.create(alice, bob, 8).id!;
    book.respond(second, 'bob', true, 9);
    expect(book.cancel(second, 'alice', 10).error).toMatch(/already started/);
  });
  it('expires quiet invites and stalled turns with no winner, then prunes old results', () => {
    const { book, id } = start();
    expect(book.expire(1000 + HORSE_INVITE_TTL_MS - 1)).toEqual([]);
    expect(book.expire(1000 + HORSE_INVITE_TTL_MS)).toEqual([id]);
    const expired = book.get(id)!;
    expect(expired.status).toBe('expired'); expect(expired.winnerId).toBeUndefined();
    expect(book.prune(expired.expiresAt - 1)).toEqual([]);
    expect(book.prune(expired.expiresAt)).toEqual([id]);
    const again = book.create(alice, bob, 5000).id!;
    book.respond(again, 'bob', true, 5500);
    book.shot(again, 'alice', rev(book, again), spotA, make(spotA), 6000);
    expect(book.expire(6000 + HORSE_TURN_TTL_MS - 1)).toEqual([]);
    expect(book.expire(6000 + HORSE_TURN_TTL_MS)).toEqual([again]);
    expect(book.get(again)!.expiresAt).toBe(6000 + HORSE_TURN_TTL_MS + HORSE_RESULT_TTL_MS);
  });
  it('survives a storage round trip and drops junk and the earlier ten-shot records', () => {
    const { book, id } = start(); book.seen(id, 'bob', 1500);
    const stored = JSON.parse(JSON.stringify(book.list())) as HorseGame[];
    const legacy = { id: 'ch_old', revision: 3, seed: 'x', status: 'pending', createdAt: 1, updatedAt: 2, expiresAt: 3,
      challenger: { ownerId: 'alice', name: 'Alice', made: [true, false] }, challengee: { ownerId: 'bob', name: 'Bob', made: [] }, seenBy: [] };
    const restored = new BasketballChallengeBook([...stored, legacy, null, { ...stored[0], id: 'bad', turn: { shooter: 'alice', role: 'match' } }]);
    expect(restored.list()).toEqual(book.list());
    expect(readChallenge(legacy)).toBe(false);
    expect(readChallenge({ ...stored[0], challenger: { ...stored[0].challenger, letters: 6 } })).toBe(false);
    expect(readChallenge(stored[0])).toBe(true);
  });
});


describe('sending a placed challenge', () => {
  it('keeps a confirmed challenge at the actual replay release', () => {
    const { book, id } = start();
    const result = book.shot(id, alice.ownerId, rev(book, id), spotA, make(spotA), 2000, spotA);
    expect(result.success).toBe(true);
    expect(result.made).toBe(true);
    expect(book.get(id)!.turn.spot).toEqual({ x: spotA.x, z: spotA.z });
    expect(book.get(id)!.lastShot!.release!.position).toEqual(spotA);
  });
  it('rejects invalid target positions without consuming the turn', () => {
    const { book, id } = start(); const before = book.get(id);
    expect(book.shot(id, alice.ownerId, rev(book, id), spotA, make(spotA), 2000, { x: NaN, y: 1.05, z: 0 }).success).toBe(false);
    expect(book.get(id)).toEqual(before);
  });
});

it('rejects moving a made challenge to a different spot',()=>{
 const {book,id}=start();const before=book.get(id);
 expect(book.shot(id,alice.ownerId,rev(book,id),spotA,make(spotA),2000,spotB).success).toBe(false);
 expect(book.get(id)).toEqual(before);
});
it('reading the game does not invalidate an in-flight shot revision',()=>{
 const {book,id}=start();const revision=rev(book,id);
 book.seen(id,bob.ownerId,1800);
 expect(rev(book,id)).toBe(revision);
 expect(book.shot(id,alice.ownerId,revision,spotA,make(spotA),2000).success).toBe(true);
});
