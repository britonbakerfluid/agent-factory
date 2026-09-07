import { describe, expect, it } from 'vitest';
import { BoardManager, boardReturnPath } from '../client/prototypes/factory25dBoardManager';
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
});
