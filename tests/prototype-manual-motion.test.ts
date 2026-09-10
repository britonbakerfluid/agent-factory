import { describe, expect, it } from 'vitest';
import type { ManualControlState } from '../shared/types';
import { clearFactorySegment, FACTORY_ELEVATOR, GARAGE_ELEVATOR, fromFactoryWorld, toFactoryWorld } from '../shared/factory25d-layout';
import { MANUAL_INTERPOLATION_MS, ManualMotionBuffer } from '../client/prototypes/factory25dManualMotion';

const origin = toFactoryWorld({ x: 0, z: 32 });
const control = (distance = 0, moving = true, facing: ManualControlState['facing'] = 'right'): ManualControlState =>
  ({ x: origin.x + distance, y: origin.y, moving, facing });

describe('manual movement presentation', () => {
  it.each([60, 144])('draws continuous movement at %i fps from 10 Hz packets, without flipping direction', fps => {
    const buffer = new ManualMotionBuffer();
    buffer.push(control(0, false), 1000, 0);
    let previous = origin.x, nextPacket = 100;
    const steps: number[] = [];
    for (let time = 0; time <= 1500; time += 1000 / fps) {
      while (time + .001 >= nextPacket) {
        buffer.push(control(nextPacket * .08), 1000 + nextPacket, nextPacket);
        nextPacket += 100;
      }
      const pose = buffer.sample(time)!;
      expect(pose.facing).toBe('right');
      expect(pose.x).toBeGreaterThanOrEqual(previous - .000001);
      if (time > MANUAL_INTERPOLATION_MS + 100) { steps.push(pose.x - previous); expect(pose.moving).toBe(true); }
      previous = pose.x;
    }
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(.001);
    expect(steps[0]).toBeCloseTo(80 / fps, 5);
  });

  it('absorbs uneven packet arrival without rolling animation backwards', () => {
    const buffer = new ManualMotionBuffer();
    buffer.push(control(), 1000, 0);
    const arrivals = [110, 205, 320, 403, 515, 610, 718, 805];
    let next = 0, last = origin.x;
    for (let now = 0; now <= 900; now += 10) {
      while (next < arrivals.length && now >= arrivals[next]) {
        buffer.push(control((next + 1) * 8), 1000 + (next + 1) * 100, arrivals[next]); next++;
      }
      const pose = buffer.sample(now)!;
      expect(pose.x).toBeGreaterThanOrEqual(last - .0001);
      expect(pose.x - last).toBeLessThanOrEqual(.801);
      if (now >= 150 && now <= 880) expect(pose.moving).toBe(true);
      expect(pose.facing).toBe('right'); last = pose.x;
    }
  });

  it('holds the last confirmed location during packet loss, then reconciles a small correction', () => {
    const buffer = new ManualMotionBuffer(); buffer.push(control(), 1000, 0); buffer.push(control(8), 1100, 100);
    buffer.sample(230);
    expect(buffer.sample(600)).toMatchObject({ x: origin.x + 8, moving: false, facing: 'right' });
    buffer.push(control(24), 1800, 800);
    expect(buffer.sample(800)?.x).toBeCloseTo(origin.x + 8);
    expect(buffer.sample(870)?.x).toBeGreaterThan(origin.x + 8);
    expect(buffer.sample(950)?.x).toBeCloseTo(origin.x + 24);
  });

  it('holds the walking pose through a short packet underrun without moving, and stops on confirmation', () => {
    const buffer = new ManualMotionBuffer();
    buffer.push(control(0, false), 1000, 0); buffer.push(control(8), 1100, 100);
    buffer.sample(170);
    expect(buffer.sample(210)?.moving).toBe(true);
    const end = buffer.sample(230)!;
    expect(end).toMatchObject({ x: origin.x + 8, moving: true });
    expect(buffer.sample(260)).toEqual(end);
    buffer.push(control(8, false), 1260, 260);
    expect(buffer.sample(270)).toMatchObject({ x: origin.x + 8, moving: false });

    const stalled = new ManualMotionBuffer();
    stalled.push(control(0, false), 1000, 0); stalled.push(control(8), 1100, 100);
    stalled.sample(170); stalled.sample(210); stalled.sample(230);
    expect(stalled.sample(345)).toMatchObject({ x: origin.x + 8, moving: false });
  });

  it('starts promptly after a long idle spell, stops, and retains the last facing', () => {
    const buffer = new ManualMotionBuffer(); buffer.push(control(0, false, 'left'), 1000, 0);
    buffer.sample(100);
    buffer.push(control(-8, true, 'left'), 10100, 9100);
    expect(buffer.sample(9170)?.x).toBeCloseTo(origin.x - 4);
    buffer.push(control(-8, false, 'left'), 10200, 9200);
    buffer.sample(9330);
    expect(buffer.sample(9400)).toEqual({ x: origin.x - 8, y: origin.y, moving: false, facing: 'left' });
  });

  it('does not mutate authoritative controls and ignores out-of-order samples', () => {
    const buffer = new ManualMotionBuffer(), value = control(0, false);
    const saved = structuredClone(value); buffer.push(value, 1000, 0); buffer.push(control(8), 1100, 100);
    buffer.push(control(-100), 1050, 120);
    for (let i = 0; i < 10; i++) buffer.sample(i * 30);
    expect(value).toEqual(saved); expect(buffer.sample(1000)?.x).toBe(origin.x + 8);
  });

  it('discards the buffer for lifts, release and floor changes rather than interpolating through the shaft', () => {
    const buffer = new ManualMotionBuffer(); buffer.push(control(), 1000, 0);
    buffer.push({ ...control(), elevatorTrip: { departure: toFactoryWorld(GARAGE_ELEVATOR), arrival: toFactoryWorld(FACTORY_ELEVATOR), startedAt: 1050, arrivesAt: 2820 } }, 1050, 50);
    expect(buffer.sample(70)).toBeUndefined();
    const upstairs = { ...control(0, false), ...toFactoryWorld(FACTORY_ELEVATOR) };
    buffer.push(upstairs, 2820, 1820); expect(buffer.sample(1820)).toMatchObject(upstairs);
    buffer.push(undefined, 2900, 1900); expect(buffer.sample(1900)).toBeUndefined();
    buffer.push(control(), 3000, 2000); buffer.push(upstairs, 3010, 2010);
    expect(buffer.sample(2010)?.y).toBe(upstairs.y);
  });

  it('resets a large relocation and follows the new pose without dragging a sprite across the room', () => {
    const buffer = new ManualMotionBuffer(); buffer.push(control(), 1000, 0); buffer.sample(50);
    buffer.push(control(100, false), 1100, 100);
    expect(buffer.sample(100)?.x).toBe(origin.x + 100);
    expect(buffer.sample(200)?.moving).toBe(false);
  });

  it('uses a safe corner path instead of cutting across the factory wall', () => {
    const from = toFactoryWorld({ x: 6.07, z: 5.59 }), to = toFactoryWorld({ x: 5.72, z: 5.19 });
    expect(clearFactorySegment(fromFactoryWorld(from), fromFactoryWorld(to))).toBe(false);
    const buffer = new ManualMotionBuffer();
    buffer.push({ ...control(), ...from }, 1000, 0);
    buffer.push({ ...control(), ...to, facing: 'down' }, 1100, 100);
    let previous = fromFactoryWorld(buffer.sample(120)!);
    for (let now = 125; now <= 220; now += 5) {
      const point = fromFactoryWorld(buffer.sample(now)!);
      expect(clearFactorySegment(point, point)).toBe(true);
      expect(clearFactorySegment(previous, point)).toBe(true);
      previous = point;
    }
  });
});
