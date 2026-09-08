import { describe, expect, it } from 'vitest';
import { BoardManager, BoardManagerAnimation, boardReturnPath } from '../client/prototypes/factory25dBoardManager';
import { boardPositionIsClear } from '../client/prototypes/factory25dBoardDrag';
import { clearFactorySegment, INTERIOR_Z } from '../shared/factory25d-layout';

const home = { x: -7, z: -2.35 };
function fixture(start = home) {
  const manager = new BoardManager(home, .28);
  let board = { ...start };
  const step = (busy = false, available = true) => {
    const before = { ...manager.position }, oldBoard = { ...board };
    const next = manager.update(1 / 60, board, busy, available);
    if (next) board = next;
    return { before, oldBoard, next };
  };
  return { manager, step, board: () => board, place: (point: typeof home) => { board = { ...point }; } };
}

describe('whiteboard manager', () => {
  it('stays idle when already at its resting spot', () => {
    const manager = new BoardManager(home, .28);
    for (let i = 0; i < 60; i++) manager.update(1 / 60, home, false, true);
    expect(manager.phase).toBe('idle'); expect(manager.position).toEqual(manager.idle);
  });
  it('stands independently while the user drags, waits after release, and grabs before moving the board', () => {
    const f = fixture(), waitingAt = { ...f.manager.position };
    for (let i = 0; i < 120; i++) { f.place({ x: -7 + i / 60, z: -2.35 }); f.step(true); }
    expect(f.manager.position).toEqual(waitingAt);
    expect(f.manager.phase).toBe('waiting');
    const released = { ...f.board() };
    for (let i = 0; i < 45; i++) f.step();
    expect(f.manager.position).toEqual(waitingAt);
    const phases = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const { before, oldBoard, next } = f.step(); phases.add(f.manager.phase);
      expect(Math.hypot(f.manager.position.x - before.x, f.manager.position.z - before.z)).toBeLessThanOrEqual(1.15 / 60 + 1e-8);
      if (next) {
        expect(phases.has('grabbing')).toBe(true);
        expect(f.manager.position.x - next.x).toBeCloseTo(f.manager.grip.x);
        expect(f.manager.position.z - next.z).toBeCloseTo(f.manager.grip.z);
        expect(Math.hypot(next.x - oldBoard.x, next.z - oldBoard.z)).toBeLessThanOrEqual(.85 / 60 + 1e-8);
      } else if (!phases.has('returning')) expect(f.board()).toEqual(released);
    }
    for (const phase of ['approaching', 'grabbing', 'returning', 'releasing', 'walking-home', 'idle']) expect(phases.has(phase), phase).toBe(true);
    expect(f.board()).toEqual(home);
    expect(f.manager.position).toEqual(f.manager.idle);
    expect(f.manager.phase).toBe('idle');
  });

  it('lets a fresh grab interrupt the return without dragging the manager along', () => {
    const f = fixture({ x: -3, z: -2.35 });
    for (let i = 0; i < 1000 && f.manager.phase !== 'returning'; i++) f.step();
    expect(f.manager.phase).toBe('returning');
    const paused = { ...f.manager.position };
    f.step(true); f.place({ x: 2, z: -2.35 });
    for (let i = 0; i < 60; i++) f.step(true);
    expect(f.manager.phase).toBe('waiting'); expect(f.manager.holding).toBe(false);
    expect(f.manager.position).toEqual(paused);
    for (let i = 0; i < 4000; i++) f.step();
    expect(f.board()).toEqual(home); expect(f.manager.position).toEqual(f.manager.idle);
  });

  it.each([{ x: 7.25, z: 2.6 }, { x: -7.25, z: -4.7 }, { x: 0, z: .33 }])('brings the board back from $x,$z without crossing a cabinet or wall', start => {
    const f = fixture(start);
    expect(boardPositionIsClear(start)).toBe(true);
    for (let i = 0; i < 5500; i++) {
      const { before, next } = f.step();
      expect(boardPositionIsClear(f.board())).toBe(true);
      const a = { x: before.x, z: before.z + INTERIOR_Z }, b = { x: f.manager.position.x, z: f.manager.position.z + INTERIOR_Z };
      expect(clearFactorySegment(a, b)).toBe(true);
      if (next) expect(f.manager.holding).toBe(true);
    }
    expect(f.board()).toEqual(home); expect(f.manager.phase).toBe('idle');
  });

  it('recovers when the user releases the board over the waiting manager', () => {
    const f = fixture(); f.place({ ...f.manager.position });
    for (let i = 0; i < 2000; i++) f.step();
    expect(f.board()).toEqual(home); expect(f.manager.position).toEqual(f.manager.idle);
  });

  it('pauses offscreen and ignores a large resume delta', () => {
    const f = fixture({ x: 1, z: -2.35 }), original = { ...f.manager.position };
    for (let i = 0; i < 300; i++) f.step(false, false);
    expect(f.manager.position).toEqual(original); expect(f.manager.phase).toBe('waiting');
    for (let i = 0; i < 60; i++) f.step();
    const before = { ...f.manager.position };
    f.manager.update(500, f.board(), false, true);
    expect(Math.hypot(f.manager.position.x - before.x, f.manager.position.z - before.z)).toBeLessThanOrEqual(1.15 * .05 + 1e-8);
  });

  it('declines a grip whose return would push the person through the left wall', () => {
    expect(boardReturnPath({ x: 7, z: -2.35 }, home, { x: -.83, z: 0 })).toBeNull();
  });

  it('finishes a brief note event with a planted writing gesture before walking home', () => {
    const manager = new BoardManager(home, .28), animation = new BoardManagerAnimation();
    const offset = manager.offset(-.30 - .23, .56), note = { x: home.x + offset.x, z: home.z + offset.z, id: 'alice:1', label: 'Alice' };
    const writingAt: number[] = [], gestures = new Set<string>();
    let arrived = false;
    for (let frame = 0; frame < 600; frame++) {
      const before = { ...manager.position };
      manager.update(1 / 60, home, false, true, frame < 40 ? note : undefined);
      expect(clearFactorySegment({ x: before.x, z: before.z + INTERIOR_Z }, { x: manager.position.x, z: manager.position.z + INTERIOR_Z })).toBe(true);
      const pose = animation.sample(manager);
      if (manager.phase === 'writing') {
        arrived = true; writingAt.push(frame); gestures.add(pose.animation);
        expect(manager.position.x).toBeCloseTo(note.x); expect(manager.position.z).toBeCloseTo(note.z);
        expect(manager.motion).toEqual({ x: 0, z: 0 }); expect(manager.taskName).toBe('Alice');
      }
      if (!arrived && frame >= 40) expect(manager.phase).toBe('walking-to-note');
    }
    expect(writingAt.at(-1)! - writingAt[0]).toBeGreaterThanOrEqual(60);
    expect(gestures).toEqual(new Set(['walk_up', 'board']));
    expect(manager.phase).toBe('idle'); expect(manager.position).toEqual(manager.idle);
  });

  it('coalesces new note events during writing without sliding across the board with a raised hand', () => {
    const manager = new BoardManager(home, .28);
    const makeNote = (x: number, id: string) => { const p = manager.offset(x - .23, .56); return { x: home.x + p.x, z: home.z + p.z, id }; };
    const first = makeNote(.3, 'first'), second = makeNote(-.3, 'second');
    for (let i = 0; i < 500 && manager.phase !== 'writing'; i++) manager.update(1 / 60, home, false, true, first);
    expect(manager.phase).toBe('writing');
    const planted = { ...manager.position };
    for (let i = 0; i < 30; i++) {
      manager.update(1 / 60, home, false, true, second);
      expect(manager.position).toEqual(planted); expect(manager.motion).toEqual({ x: 0, z: 0 });
    }
    let wroteSecond = false;
    for (let i = 0; i < 500; i++) {
      manager.update(1 / 60, home, false, true);
      if (manager.phase === 'writing' && Math.hypot(manager.position.x - second.x, manager.position.z - second.z) < .01) wroteSecond = true;
    }
    expect(wroteSecond).toBe(true); expect(manager.position).toEqual(manager.idle);
  });

  it('eases into walking instead of switching from standing straight to full speed', () => {
    const manager = new BoardManager(home, .28), note = { x: -6.2, z: -1.7, id: 'work' };
    const speeds: number[] = [];
    for (let i = 0; i < 8; i++) {
      manager.update(1 / 60, home, false, true, note);
      speeds.push(Math.hypot(manager.motion.x, manager.motion.z) * 60);
    }
    expect(speeds[0]).toBeLessThan(.1); expect(speeds.at(-1)!).toBeGreaterThan(speeds[0]);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i] - speeds[i - 1]).toBeLessThanOrEqual(4 / 60 + 1e-8);
  });
});

describe('whiteboard staff poses', () => {
  it('keeps a continuous backward stride when pull direction changes, and plants the feet to grip/release', () => {
    const animation = new BoardManagerAnimation();
    const state = { phase: 'returning' as const, phaseElapsed: .5, holding: true, grip: { x: 1, z: 0 }, motion: { x: -.07, z: 0 } };
    animation.sample(state); animation.sample(state);
    expect(animation.sample(state)).toEqual({ animation: 'hold_left', frame: 2 });
    state.motion = { x: .001, z: 0 };
    expect(animation.sample(state)).toEqual({ animation: 'hold_left', frame: 2 });
    expect(animation.sample({ ...state, motion: { x: 0, z: 0 }, phase: 'grabbing', phaseElapsed: .05 })).toEqual({ animation: 'walk_left', frame: 1 });
    expect(animation.sample({ ...state, motion: { x: 0, z: 0 }, phase: 'grabbing', phaseElapsed: .2 })).toEqual({ animation: 'hold_left', frame: 1 });
    expect(animation.sample({ ...state, motion: { x: 0, z: 0 }, phase: 'releasing', phaseElapsed: .2 })).toEqual({ animation: 'walk_left', frame: 1 });
  });

  it('holds a stable heading for nearly diagonal walking and does not replay steps for reduced motion', () => {
    const animation = new BoardManagerAnimation();
    const state = { phase: 'approaching' as const, phaseElapsed: .5, holding: false, grip: { x: 0, z: 0 }, motion: { x: .011, z: .001 } };
    expect(animation.sample(state).animation).toBe('walk_right');
    for (const [x, z] of [[.01, .011], [.011, .01], [.01, .011]]) {
      expect(animation.sample({ ...state, motion: { x, z } }).animation).toBe('walk_right');
    }
    expect(animation.sample(state, true).frame).toBe(0);
    expect(animation.sample({ ...state, phase: 'idle', motion: { x: 0, z: 0 } })).toEqual({ animation: 'idle', frame: 0 });
  });
});
