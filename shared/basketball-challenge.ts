import { FACTORY_OBSTACLES, INTERIOR_Z } from './factory25d-layout.js';
import { stepVisitorBall, validBallVector, VISITOR_BALL_RADIUS, type BallVector } from './visitor-basketball.js';

/**
 * Asynchronous two-player HORSE between durable owner identities.
 * The setter picks any clear floor spot and shoots. A made set records the spot;
 * the opponent must shoot from that spot at normal release height. A missed match
 * earns the matcher a letter (H, O, R, S, E); five letters loses. After a matching
 * attempt the matcher becomes the next setter, so turns alternate. A missed set
 * simply passes setting to the opponent. Every release is replayed here with the
 * shared deterministic ball physics; a client only ever reports a release.
 */
export const HORSE_LETTERS = 'HORSE';
export const HORSE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HORSE_TURN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HORSE_RESULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const HORSE_MAX_OUTGOING = 3;
export const HORSE_SHOT_GAP_MS = 400;
/** Release height of the hovering ready ball; every recorded shot leaves from here. */
export const HORSE_RELEASE_Y = 1.05;
export const HORSE_SPOT_TOLERANCE = .08;
/** Playable floor in factory-interior coordinates: inside the walls, clear of furniture. */
const HORSE_FLOOR = { left: -7.6, right: 7.6, near: -6.0, far: 11.5 };

export type HorseStatus = 'pending' | 'playing' | 'complete' | 'declined' | 'cancelled' | 'expired';
export interface HorseSide { ownerId: string; name: string; letters: number }
export interface HorseSpot { x: number; z: number }
export interface HorseTurn { shooter: string; role: 'set' | 'match'; spot?: HorseSpot; setBy?: string }
export interface HorseShot { shooter: string; role: 'set' | 'match'; made: boolean; spot: HorseSpot; at: number; release?: { position: BallVector; velocity: BallVector } }
export interface HorseGame {
  kind: 'horse'; id: string; revision: number; status: HorseStatus;
  createdAt: number; updatedAt: number; expiresAt: number;
  challenger: HorseSide; challengee: HorseSide;
  turn: HorseTurn; lastShot?: HorseShot;
  acceptedAt?: number; resolvedAt?: number; winnerId?: string;
  /** Owner ids that have opened this game on some device; quiets prompts everywhere. */
  seenBy: string[];
}
/** Storage and wire alias kept from the first challenge format. */
export type BasketballChallenge = HorseGame;
export type ChallengeRequest = { type: 'challenge' } & (
  { action: 'create'; challengeeId: string }
  | { action: 'cancel'; id: string }
  | { action: 'respond'; id: string; accept: boolean }
  | { action: 'shot'; id: string; revision: number; position: BallVector; velocity: BallVector; targetSpot?: BallVector }
  | { action: 'seen'; id: string });
export interface ChallengeState { type: 'challenge_state'; serverTime: number; challenges: HorseGame[] }
export interface ChallengeResult { type: 'challenge_result'; success: boolean; action: ChallengeRequest['action']; id?: string; error?: string; made?: boolean; letter?: string }

export function horseLetters(side: HorseSide) { return HORSE_LETTERS.slice(0, Math.max(0, Math.min(5, side.letters))); }
export function horseActive(game: HorseGame) { return game.status === 'pending' || game.status === 'playing'; }
export function horseOpponent(game: HorseGame, ownerId: string) { return game.challenger.ownerId === ownerId ? game.challengee : game.challenger; }
export function horseSide(game: HorseGame, ownerId: string) { return game.challenger.ownerId === ownerId ? game.challenger : game.challengee.ownerId === ownerId ? game.challengee : undefined; }
/** Whether this person may shoot right now: their turn, and the invite already answered when they are the recipient. */
export function horseCanShoot(game: HorseGame, ownerId: string) {
  return horseActive(game) && game.turn.shooter === ownerId && (game.status === 'playing' || game.challenger.ownerId === ownerId);
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** A setter may shoot from any clear floor spot inside the room at the normal release height. */
export function validHorseSpot(position: BallVector) {
  if (!validBallVector(position, false, 'factory')) return false;
  if (position.x < HORSE_FLOOR.left || position.x > HORSE_FLOOR.right || position.z < HORSE_FLOOR.near || position.z > HORSE_FLOOR.far) return false;
  if (Math.abs(position.y - HORSE_RELEASE_Y) > .3) return false;
  const worldZ = position.z + INTERIOR_Z;
  return !FACTORY_OBSTACLES.some(o => position.x + VISITOR_BALL_RADIUS > o.left && position.x - VISITOR_BALL_RADIUS < o.right
    && worldZ + VISITOR_BALL_RADIUS > o.near && worldZ - VISITOR_BALL_RADIUS < o.far);
}
/** Deterministic replay of one release. The same inputs always produce the same answer on every machine. */
export function simulateChallengeShot(position: BallVector, velocity: BallVector) {
  const ball = { position: { ...position }, velocity: { ...velocity }, scored: false, room: 'factory' as const };
  for (let elapsed = 0; elapsed < 4; elapsed += .1) {
    stepVisitorBall(ball, .1);
    if (ball.scored) return true;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y, ball.velocity.z);
    if (elapsed > .6 && ball.position.y <= VISITOR_BALL_RADIUS + .002 && speed < .5) return false;
  }
  return ball.scored;
}

const fail = (action: ChallengeRequest['action'], error: string, id?: string): ChallengeResult => ({ type: 'challenge_result', success: false, action, id, error });
const ok = (action: ChallengeRequest['action'], id: string, extra: Partial<ChallengeResult> = {}): ChallengeResult => ({ type: 'challenge_result', success: true, action, id, ...extra });

export interface ChallengePerson { ownerId: string; name: string }

/** Shared by the server and the isolated local preview. Pure bookkeeping; no clocks, sockets or storage. */
export class BasketballChallengeBook {
  private games = new Map<string, HorseGame>();
  private sequence = 0;
  constructor(stored: unknown[] = []) {
    for (const game of stored) if (readChallenge(game)) this.games.set(game.id, structuredClone(game));
  }
  list() { return [...this.games.values()].map(game => structuredClone(game)); }
  get(id: string) { const game = this.games.get(id); return game && structuredClone(game); }
  forOwner(ownerId: string) {
    return this.list().filter(game => game.challenger.ownerId === ownerId || game.challengee.ownerId === ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  private touch(game: HorseGame, now: number) { game.revision++; game.updatedAt = now; }
  /** A result is news to both players, however much of the invite they had already seen. */
  private finish(game: HorseGame, status: HorseStatus, now: number) { game.status = status; game.resolvedAt = now; game.expiresAt = now + HORSE_RESULT_TTL_MS; game.seenBy = []; }

  create(challenger: ChallengePerson, challengee: ChallengePerson, now: number): ChallengeResult {
    if (!challenger.ownerId || !challengee.ownerId) return fail('create', 'Connect your browser to challenge someone.');
    if (challenger.ownerId === challengee.ownerId) return fail('create', 'Pick someone else to challenge.');
    if (challengee.ownerId.startsWith('legacy:')) return fail('create', `${challengee.name} has not connected a browser yet, so they cannot play.`);
    const active = [...this.games.values()].filter(horseActive);
    if (active.some(g => [g.challenger.ownerId, g.challengee.ownerId].sort().join() === [challenger.ownerId, challengee.ownerId].sort().join()))
      return fail('create', `You and ${challengee.name} already have a game going.`);
    if (active.filter(g => g.challenger.ownerId === challenger.ownerId).length >= HORSE_MAX_OUTGOING)
      return fail('create', `You already have ${HORSE_MAX_OUTGOING} challenges waiting. Cancel one first.`);
    const id = `horse_${hash(`${now}:${++this.sequence}:${challenger.ownerId}`).toString(36)}${this.sequence.toString(36)}`;
    const game: HorseGame = {
      kind: 'horse', id, revision: 1, status: 'pending', createdAt: now, updatedAt: now, expiresAt: now + HORSE_INVITE_TTL_MS,
      challenger: { ownerId: challenger.ownerId, name: challenger.name, letters: 0 },
      challengee: { ownerId: challengee.ownerId, name: challengee.name, letters: 0 },
      turn: { shooter: challenger.ownerId, role: 'set' }, seenBy: [challenger.ownerId],
    };
    this.games.set(id, game);
    return ok('create', id);
  }
  cancel(id: string, ownerId: string, now: number): ChallengeResult {
    const game = this.games.get(id);
    if (!game || game.challenger.ownerId !== ownerId) return fail('cancel', 'That challenge is not yours to cancel.', id);
    if (game.status !== 'pending') return fail('cancel', 'That game has already started.', id);
    this.finish(game, 'cancelled', now); this.touch(game, now);
    return ok('cancel', id);
  }
  respond(id: string, ownerId: string, accept: boolean, now: number): ChallengeResult {
    const game = this.games.get(id);
    if (!game || game.challengee.ownerId !== ownerId) return fail('respond', 'That challenge is not addressed to you.', id);
    if (game.status !== 'pending') return fail('respond', 'That challenge is no longer waiting.', id);
    if (accept) { game.status = 'playing'; game.acceptedAt = now; game.expiresAt = now + HORSE_TURN_TTL_MS; }
    else this.finish(game, 'declined', now);
    if (!game.seenBy.includes(ownerId)) game.seenBy.push(ownerId);
    this.touch(game, now);
    return ok('respond', id);
  }
  /** Validates the release for the current turn, replays it, and advances the game. */
  shot(id: string, ownerId: string, revision: unknown, position: unknown, velocity: unknown, now: number, targetSpot?: BallVector): ChallengeResult {
    const game = this.games.get(id);
    if (!game || !horseActive(game)) return fail('shot', 'That game is over.', id);
    if (game.turn.shooter !== ownerId || !horseSide(game, ownerId)) return fail('shot', 'It is not your shot.', id);
    if (game.status === 'pending' && game.challenger.ownerId !== ownerId) return fail('shot', 'Accept the challenge first.', id);
    if (revision !== game.revision) return fail('shot', 'That turn was already played.', id);
    if (!validBallVector(position, false, 'factory') || !validBallVector(velocity, true)) return fail('shot', 'That release was out of bounds.', id);
    if (game.turn.role === 'set') {
      if (!validHorseSpot(position)) return fail('shot', 'Set your shot from a clear spot on the floor.', id);
    } else {
      const spot = game.turn.spot!;
      if (Math.hypot(position.x - spot.x, position.z - spot.z) > HORSE_SPOT_TOLERANCE || Math.abs(position.y - HORSE_RELEASE_Y) > .3)
        return fail('shot', 'Match the shot from the marked spot.', id);
    }
    if (targetSpot !== undefined && (game.turn.role !== 'set' || !validBallVector(targetSpot, false, 'factory') || !validHorseSpot(targetSpot) || Math.hypot(targetSpot.x-position.x,targetSpot.z-position.z)>HORSE_SPOT_TOLERANCE)) return fail('shot', 'The challenge must use the spot where you made the shot.', id);
    const made = simulateChallengeShot(position, velocity);
    const me = horseSide(game, ownerId)!, other = horseOpponent(game, ownerId);
    const role = game.turn.role, spot = { x: position.x, z: position.z };
    let letter: string | undefined;
    if (role === 'set') {
      game.turn = made ? { shooter: other.ownerId, role: 'match', spot, setBy: ownerId } : { shooter: other.ownerId, role: 'set' };
    } else {
      if (!made) { me.letters++; letter = HORSE_LETTERS[me.letters - 1]; }
      // The matcher sets next, so turns alternate regardless of the outcome.
      game.turn = { shooter: ownerId, role: 'set' };
    }
    game.lastShot = { shooter: ownerId, role, made, spot, at: now, release: { position: { ...position }, velocity: { ...velocity } } };
    if (me.letters >= HORSE_LETTERS.length) { game.winnerId = other.ownerId; this.finish(game, 'complete', now); }
    else if (game.status === 'playing') game.expiresAt = now + HORSE_TURN_TTL_MS;
    this.touch(game, now);
    return ok('shot', id, { made, letter });
  }
  seen(id: string, ownerId: string, _now: number): ChallengeResult {
    const game = this.games.get(id);
    if (!game || !horseSide(game, ownerId)) return fail('seen', 'Unknown challenge.', id);
    if (!game.seenBy.includes(ownerId)) { game.seenBy.push(ownerId); }
    return ok('seen', id);
  }
  /** Unanswered invites and stalled turns lapse quietly; nobody wins by default. */
  expire(now: number): string[] {
    const changed: string[] = [];
    for (const game of this.games.values()) {
      if (!horseActive(game) || now < game.expiresAt) continue;
      this.finish(game, 'expired', now); this.touch(game, now); changed.push(game.id);
    }
    return changed;
  }
  /** Finished games leave the book after their result window. */
  prune(now: number): string[] {
    const removed: string[] = [];
    for (const [id, game] of this.games) if (!horseActive(game) && now >= game.expiresAt) { this.games.delete(id); removed.push(id); }
    return removed;
  }
}

/** Only HORSE records are trusted; earlier ten-shot records and junk are dropped rather than interpreted. */
export function readChallenge(value: unknown): value is HorseGame {
  if (!value || typeof value !== 'object') return false;
  const g = value as HorseGame;
  const side = (s: unknown): s is HorseSide => !!s && typeof s === 'object' && typeof (s as HorseSide).ownerId === 'string'
    && typeof (s as HorseSide).name === 'string' && Number.isInteger((s as HorseSide).letters) && (s as HorseSide).letters >= 0 && (s as HorseSide).letters <= HORSE_LETTERS.length;
  const spot = (p: unknown): p is HorseSpot => !!p && typeof p === 'object' && Number.isFinite((p as HorseSpot).x) && Number.isFinite((p as HorseSpot).z);
  return g.kind === 'horse' && typeof g.id === 'string' && g.id.length < 64 && Number.isSafeInteger(g.revision)
    && ['pending', 'playing', 'complete', 'declined', 'cancelled', 'expired'].includes(g.status)
    && [g.createdAt, g.updatedAt, g.expiresAt].every(n => Number.isFinite(n)) && side(g.challenger) && side(g.challengee)
    && !!g.turn && typeof g.turn === 'object' && typeof g.turn.shooter === 'string' && (g.turn.role === 'set' || (g.turn.role === 'match' && spot(g.turn.spot)))
    && (g.lastShot === undefined || (typeof g.lastShot.shooter === 'string' && typeof g.lastShot.made === 'boolean' && Number.isFinite(g.lastShot.at) && ['set','match'].includes(g.lastShot.role) && spot(g.lastShot.spot)))
    && (g.lastShot?.release === undefined || (validBallVector(g.lastShot.release.position, false, 'factory') && validBallVector(g.lastShot.release.velocity, true)))
    && Array.isArray(g.seenBy) && g.seenBy.every(id => typeof id === 'string');
}

/** One line for the island, the desk and the glass. */
export function describeChallenge(game: HorseGame, viewerId: string): string {
  const mine = game.challenger.ownerId === viewerId, other = horseOpponent(game, viewerId);
  const myTurn = game.turn.shooter === viewerId;
  switch (game.status) {
    case 'pending':
      if (!mine) return game.turn.role === 'match' ? `${other.name} challenged you to HORSE and set a shot` : `${other.name} challenged you to HORSE`;
      if (myTurn) return `set the first shot for ${other.name}`;
      return game.turn.role === 'match' ? `waiting for ${other.name} to match your shot` : `waiting for ${other.name} to accept`;
    case 'playing':
      if (myTurn) return game.turn.role === 'match' ? `match ${other.name}'s shot` : `your shot · set one for ${other.name}`;
      return game.turn.role === 'match' ? `${other.name} must match your shot` : `${other.name} is setting a shot`;
    case 'complete': return game.winnerId === viewerId ? `Game over · you won HORSE` : `Game over · ${other.name} won HORSE`;
    case 'declined': return mine ? `${other.name} passed on HORSE` : `you passed on ${other.name}'s challenge`;
    case 'cancelled': return mine ? `you withdrew your challenge to ${other.name}` : `${other.name} withdrew their challenge`;
    case 'expired': return `HORSE with ${other.name} lapsed`;
  }
}
/** The one-sentence rule sheet shown once from the desk and the island. */
export const HORSE_HELP = 'HORSE (alternating turns): choose a clear spot before shooting. If you make the shot, the other player must make it from the same spot or take a letter. A missed set passes control to the other player without a letter. After a match attempt, the matcher sets next, made or missed. Five letters loses.';
