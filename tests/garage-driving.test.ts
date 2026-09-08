import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { GarageDrivingSimulation, GARAGE_MAX_MARKS, GARAGE_MARK_LIFETIME_MS, GARAGE_FULL_REPAIR_SECONDS, GARAGE_DRIVE_PROFILES, garageCarBlocksSegment } from '../shared/factory25d-driving';
import { GARAGE_CAR_BAYS, GARAGE_CAR_IDS, GARAGE_CAR_YAW, garageCarVisitPose } from '../shared/factory25d-garage';
import { GarageDrivingManager, GARAGE_INPUT_STALE_MS, GARAGE_LEASE_IDLE_MS } from '../server/garage-driving';
import { StateManager } from '../server/state';
import { BroadcastManager } from '../server/ws/broadcast';
import { DEFAULT_AVATAR } from '../shared/constants';
import { MINI_WORKSTATION_SLOT, toFactoryWorld } from '../shared/factory25d-layout';

function socket() {
  const messages: Array<Record<string, unknown>> = [];
  return { socket: { readyState: 1, on() {}, send(raw: string) { messages.push(JSON.parse(raw)); } } as unknown as WebSocket, messages };
}
function setup() {
  let now = 1000;
  const state = new StateManager('factory25d', () => now), broadcast = new BroadcastManager(), manager = new GarageDrivingManager(state, broadcast, () => now);
  const a = socket(), b = socket(); broadcast.add(a.socket); broadcast.add(b.socket);
  return { state, manager, a, b, time: (n: number) => { now = n; }, tick: (n: number) => { now = n; manager.tick(now); } };
}
function step(sim: GarageDrivingSimulation, seconds: number, start = 1000) {
  for (let i = 1; i <= Math.ceil(seconds * 60); i++) sim.step(1 / 60, start + i * 1000 / 60);
}

describe('shared garage physics', () => {
  it.each([['mini', 4.85], ['porsche', 6.19], ['delorean', 4.45], ['f1', 7.98]] as const)('%s has at least 70 percent more speed in the first second', (id, oldLaunchSpeed) => {
    const sim = new GarageDrivingSimulation(); sim.claim(id, 'visitor'); step(sim, 1.2);
    const car = sim.car(id); Object.assign(car, { x: -9, z: 7, yaw: Math.PI / 2 });
    sim.setInput(id, { throttle: 1, steer: 0, drift: false }); step(sim, 1, 3000);
    expect(car.damage).toBe(0); expect(sim.isClear(car)).toBe(true);
    expect(Math.hypot(car.vx, car.vz)).toBeGreaterThan(oldLaunchSpeed * 1.7);
  });

  it.each([['mini', 2.1], ['porsche', 1.85], ['delorean', 2.1], ['f1', 1.6]] as const)('%s crosses the usable straight in less than %s seconds', (id, limit) => {
    const sim = new GarageDrivingSimulation(); sim.claim(id, 'visitor'); step(sim, 1.2);
    const car = sim.car(id); Object.assign(car, { x: -9, z: 7, yaw: Math.PI / 2 });
    sim.setInput(id, { throttle: 1, steer: 0, drift: false });
    let elapsed = 0;
    while (car.x < 6 && elapsed < 3) {
      sim.step(1 / 60, 3000 + elapsed * 1000); elapsed += 1 / 60;
      expect(car.damage).toBe(0); expect(sim.isClear(car)).toBe(true);
    }
    expect(car.x).toBeGreaterThanOrEqual(6); expect(elapsed).toBeLessThan(limit);
  });

  it.each(GARAGE_CAR_IDS)('%s reverses faster while remaining controllable and bounded', id => {
    const sim = new GarageDrivingSimulation(); sim.claim(id, 'visitor'); step(sim, 1.2);
    const car = sim.car(id); Object.assign(car, { x: 8, z: 7, yaw: Math.PI / 2 });
    sim.setInput(id, { throttle: -1, steer: 0, drift: false }); step(sim, 2, 3000);
    expect(car.vx).toBeLessThan(-4.3); expect(car.vx).toBeGreaterThan(-5.5);
    expect(car.damage).toBe(0); expect(sim.isClear(car)).toBe(true);
  });

  it('coasts naturally and brakes much faster than releasing the throttle', () => {
    const speeds = [0, -1].map(throttle => {
      const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
      const car = sim.car('mini'); Object.assign(car, { x: -5, z: 7, yaw: Math.PI / 2, vx: 5 });
      sim.setInput('mini', { throttle, steer: 0, drift: false }); step(sim, .4);
      expect(car.damage).toBe(0); return Math.hypot(car.vx, car.vz);
    });
    expect(speeds[0]).toBeGreaterThan(4.7); expect(speeds[1]).toBeLessThan(1.3);
  });

  it('retains hard-crash damage through recovery and claiming, and repairs gradually only while parked', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    const car = sim.car('mini'); Object.assign(car, { x: 10.3, z: 7, yaw: Math.PI / 2, vx: 7 }); step(sim, .2);
    const damage = car.damage; expect(damage).toBeGreaterThan(.35);
    expect(sim.reset('mini')).toBe(true); expect(car.damage).toBe(damage);
    step(sim, 3); expect(car.damage).toBe(damage);
    step(sim, 10); expect(car.damage).toBeLessThan(damage); expect(car.damage).toBeGreaterThan(damage - .2);
    sim.claim('mini', 'next visitor'); const interrupted = car.damage;
    step(sim, 12); expect(car.damage).toBe(interrupted);
    sim.release('mini'); step(sim, 3); expect(car.mode).toBe('parked'); expect(car.damage).toBe(interrupted);
    step(sim, GARAGE_FULL_REPAIR_SECONDS + 5); expect(car.damage).toBe(0);
  });

  it('starts clear in the measured bays and gives the four cars distinct acceleration', () => {
    const speeds: number[] = [];
    for (const id of GARAGE_CAR_IDS) {
      const sim = new GarageDrivingSimulation();
      expect(sim.cars.every(car => sim.isClear(car))).toBe(true);
      sim.claim(id, 'visitor'); sim.setInput(id, { throttle: -1, steer: 0, drift: false }); step(sim, .2);
      speeds.push(Math.hypot(sim.car(id).vx, sim.car(id).vz));
    }
    expect(new Set(speeds.map(v => v.toFixed(3))).size).toBe(4);
    expect(speeds[3]).toBeGreaterThan(speeds[0]); expect(speeds[0]).toBeGreaterThan(speeds[2]);
  });

  it('substeps fast inputs against props, walls and other cars, with bounded collision damage', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    const car = sim.car('mini'); Object.assign(car, { x: 0, z: 7, yaw: Math.PI / 2 });
    sim.setInput('mini', { throttle: 1, steer: 0, drift: false });
    for (let i = 0; i < 240; i++) { sim.step(.1, 1000 + i * 100); expect(sim.isClear(car)).toBe(true); }
    expect(car.x).toBeLessThan(11); expect(car.damage).toBeGreaterThan(0); expect(car.damage).toBeLessThanOrEqual(1);
    Object.assign(car, { x: -4.6, z: 5, yaw: Math.PI, vx: 0, vz: -6 });
    for (let i = 0; i < 120; i++) { sim.step(1 / 60, 30_000 + i * 1000 / 60); expect(sim.isClear(car)).toBe(true); }
    expect(car.z).toBeLessThan(2); expect(sim.car('porsche').z).toBeLessThan(GARAGE_CAR_BAYS.porsche.z);
    expect(sim.car('porsche').damage).toBeGreaterThan(0); expect(sim.cars.every(c => sim.isClear(c))).toBe(true);
  });

  it('transfers bumper momentum by mass, moves parked cars, then lets them settle without changing ownership', () => {
    const launch = (target: 'porsche' | 'f1') => {
      const sim = new GarageDrivingSimulation(); sim.claim('mini', 'driver');
      const car = sim.car('mini'), pushed = sim.car(target);
      Object.assign(car, { x: -3, z: 7, yaw: Math.PI / 2, vx: 6 });
      const gap = (GARAGE_DRIVE_PROFILES.mini.length + GARAGE_DRIVE_PROFILES[target].length) / 2 + .28;
      Object.assign(pushed, { x: -3 + gap + .01, z: 7, yaw: Math.PI / 2 });
      sim.step(1 / 120, 1000);
      expect(car.vx).toBeGreaterThan(0); expect(car.vx).toBeLessThan(6);
      expect(pushed.vx).toBeGreaterThan(0); expect(sim.cars.every(c => sim.isClear(c))).toBe(true);
      const transferred = pushed.vx, oldX = pushed.x;
      sim.setInput('mini', { throttle: -1, steer: 0, drift: false }); step(sim, .1);
      Object.assign(car, { x: -9, z: 8, vx: 0, vz: 0 }); sim.setInput('mini', { throttle: 0, steer: 0, drift: false });
      step(sim, 5);
      expect(pushed.x).toBeGreaterThan(oldX + .1); expect(pushed.vx).toBe(0); expect(pushed.vz).toBe(0);
      expect(pushed.mode).toBe('parked'); expect(pushed.driverVisitorId).toBeUndefined();
      const settled = pushed.x; step(sim, 1); expect(pushed.x).toBe(settled);
      return transferred;
    };
    expect(launch('f1')).toBeGreaterThan(launch('porsche'));
  });

  it('pushes occupied cars and chains while retaining their drivers, with all bodies bounded at a wall', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'a'); sim.claim('porsche', 'b');
    const a = sim.car('mini'), b = sim.car('porsche'), c = sim.car('f1');
    Object.assign(a, { x: 3, z: 7, yaw: Math.PI / 2, vx: 7 });
    Object.assign(b, { x: 5.17, z: 7, yaw: Math.PI / 2 });
    Object.assign(c, { x: 7.7, z: 7, yaw: Math.PI / 2 });
    sim.setInput('mini', { throttle: 1, steer: 0, drift: false });
    for (let i = 0; i < 300; i++) {
      sim.step(1 / 60, 1000 + i * 1000 / 60);
      expect(sim.cars.every(car => sim.isClear(car))).toBe(true);
    }
    expect(b.x).toBeGreaterThan(5.5); expect(c.x).toBeGreaterThan(8);
    expect(c.x).toBeLessThan(10.52);
    expect(b).toMatchObject({ mode: 'driving', driverVisitorId: 'b' });
    expect(a).toMatchObject({ mode: 'driving', driverVisitorId: 'a' });
    expect(sim.claim('porsche', 'a')).toBe(false);
  });

  it('nudges a pushable pedestrian with bounded steps and keeps car power, while walls block unsafe nudges', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    const car = sim.car('mini'); Object.assign(car, { x: -3, z: 7, yaw: Math.PI / 2, vx: 5 });
    const pedestrian = { sessionId: 'walker', x: -1.7, z: 7, radius: .32, pushable: true };
    for (let i = 0; i < 15; i++) {
      sim.setInput('mini', { throttle: 1, steer: 0, drift: false }); sim.step(1 / 60, 1000 + i * 1000 / 60, [pedestrian]);
      for (const push of sim.pedestrianPushes) {
        expect(Math.hypot(push.x - push.fromX, push.z - push.fromZ)).toBeLessThan(.3);
        Object.assign(pedestrian, { x: push.x, z: push.z });
      }
      expect(sim.isClear(car)).toBe(true);
    }
    expect(pedestrian.x).toBeGreaterThan(-1); expect(car.vx).toBeGreaterThan(3); expect(car.damage).toBe(0);
    Object.assign(car, { x: 10.32, z: 7, vx: 3 }); Object.assign(pedestrian, { x: 11.479, z: 7 });
    const before = pedestrian.x; sim.step(.1, 2000, [pedestrian]);
    expect(sim.pedestrianPushes).toHaveLength(0); expect(pedestrian.x).toBe(before); expect(sim.isClear(car)).toBe(true);
  });

  it('brakes for anonymous pedestrian capsules without damage or passing through them', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    const car = sim.car('mini'); Object.assign(car, { x: 0, z: 5, yaw: 0, vx: 0, vz: 3 });
    sim.setInput('mini', { throttle: 1, steer: 0, drift: false });
    for (let i = 0; i < 120; i++) sim.step(1 / 60, 1000 + i * 1000 / 60, [{ x: 0, z: 8 }]);
    expect(car.z).toBeLessThan(6.9); expect(car.damage).toBe(0);
    expect(garageCarBlocksSegment(car, { x: -2, z: car.z }, { x: 2, z: car.z })).toBe(true);
  });

  it('records bounded drift tire segments, breaks them at reset, and supplies current marks to late joiners', () => {
    const sim = new GarageDrivingSimulation(); sim.startDonut('mini', 'jonathan'); step(sim, 13);
    expect(sim.marks.length).toBeGreaterThan(4); expect(sim.marks.length).toBeLessThanOrEqual(GARAGE_MAX_MARKS);
    expect(sim.snapshot(15_000).marks).toEqual(sim.marks);
    expect(sim.marks.every(m => Math.hypot(m.x2 - m.x1, m.z2 - m.z1) < .5)).toBe(true);
    const newest = sim.marks.at(-1)!.id;
    expect(sim.reset('mini')).toBe(true); sim.startDonut('mini', 'other'); step(sim, 13, 20_000);
    expect(sim.marks.filter(m => m.id > newest).every(m => Math.hypot(m.x2 - m.x1, m.z2 - m.z1) < .5)).toBe(true);
    sim.step(.1, 40_000 + GARAGE_MARK_LIFETIME_MS); expect(sim.marks).toHaveLength(0);
  });

  it('self-parks from its current pose, and refuses a recovery into an occupied bay', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    sim.setInput('mini', { throttle: -1, steer: 0, drift: false });
    // Reach the open aisle before requesting parking; a fixed three-second
    // reverse would now drive through the aisle and into the workbench.
    for (let i = 0; i < 180 && sim.car('mini').z < 6; i++) sim.step(1 / 60, 1000 + i * 1000 / 60);
    expect(sim.car('mini').z).toBeGreaterThan(5);
    sim.release('mini');
    for (let i = 0; i < 600; i++) { sim.step(1 / 60, 5000 + i * 1000 / 60); expect(sim.cars.every(car => sim.isClear(car))).toBe(true); }
    expect(sim.car('mini')).toMatchObject({ ...GARAGE_CAR_BAYS.mini, yaw: GARAGE_CAR_YAW, mode: 'parked', damage: 0 });
    expect(sim.car('mini').driverVisitorId).toBeUndefined();
    sim.claim('mini', 'visitor'); Object.assign(sim.car('mini'), { x: 0, z: 6 });
    sim.step(.01, 20_000, [{ ...GARAGE_CAR_BAYS.mini }]);
    expect(sim.reset('mini')).toBe(false); expect(sim.car('mini').mode).toBe('returning');
  });

  it.each(['mini', 'f1', 'delorean'] as const)('completes an idle %s donut and its safe return without hitting props', id => {
    const sim = new GarageDrivingSimulation(); sim.startDonut(id, 'idle');
    for (let i = 0; i < 2400; i++) {
      sim.step(1 / 60, 1000 + i * 1000 / 60); expect(sim.car(id).damage).toBe(0);
      if (sim.car(id).mode === 'parked') break;
    }
    expect(sim.car(id).mode).toBe('parked');
    if (id === 'delorean') expect(sim.marks).toHaveLength(0);
    else expect(sim.marks.length).toBeGreaterThan(0);
  });

  it.each([false, true])('finds a fresh route around a newly parked car and waits for its own bay (occupied=%s)', occupied => {
    const sim = new GarageDrivingSimulation();
    // Porsche leaves its bay; the Mini crosses that empty bay on its route.
    sim.claim('porsche', 'b'); Object.assign(sim.car('porsche'), { x: 5, z: 8 });
    Object.assign(sim.car('mini'), { x: -4.6, z: -.3, yaw: 0 });
    sim.claim('mini', 'a'); sim.setInput('mini', { throttle: 1, steer: 0, drift: false }); step(sim, 2.5);
    expect(sim.car('mini').z).toBeGreaterThan(3);
    expect(sim.reset('porsche')).toBe(true); // Its parked hull now cuts the route the Mini took out.
    sim.release('mini');
    const pedestrian = occupied ? [{ ...GARAGE_CAR_BAYS.mini }] : [];
    for (let i = 1; i <= 300; i++) {
      sim.step(.05, 4000 + i * 50, pedestrian);
      expect(sim.isClear(sim.car('mini'))).toBe(true);
    }
    if (occupied) {
      expect(sim.car('mini').mode).toBe('returning');
      expect(sim.car('mini').z).toBeGreaterThan(2);
      const blocked = { x: sim.car('mini').x, z: sim.car('mini').z };
      for (let i = 1; i <= 100; i++) sim.step(.05, 19_000 + i * 50, pedestrian);
      expect(sim.car('mini')).toMatchObject({ ...blocked, mode: 'returning' });
      for (let i = 1; i <= 300; i++) sim.step(.05, 24_000 + i * 50); // Bay clears; a fresh route can now finish.
    }
    expect(sim.car('mini')).toMatchObject({ ...GARAGE_CAR_BAYS.mini, yaw: GARAGE_CAR_YAW, mode: 'parked' });
    expect(sim.car('mini').driverVisitorId).toBeUndefined();
  });

  it('self-parks after a long excursion without replaying the previous driving loop', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('mini', 'visitor');
    sim.setInput('mini', { throttle: -1, steer: 0, drift: false }); step(sim, 3);
    // Supply a new clear pose as if reached after an arbitrarily long trip.
    Object.assign(sim.car('mini'), { x: -5, z: 7, yaw: .2 }); sim.release('mini');
    for (let i = 1; i <= 1200 && sim.car('mini').mode !== 'parked'; i++) {
      sim.step(1 / 60, 5000 + i * 1000 / 60); expect(sim.isClear(sim.car('mini'))).toBe(true);
    }
    expect(sim.car('mini')).toMatchObject({ ...GARAGE_CAR_BAYS.mini, yaw: GARAGE_CAR_YAW, mode: 'parked' });
  });

  it('lifts the DeLorean over other cars, shares its height, and never draws airborne tire marks', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('delorean', 'pilot'); step(sim, 1.2);
    const car = sim.car('delorean'); expect(car.hoverHeight).toBe(1.45);
    Object.assign(car, { ...GARAGE_CAR_BAYS.mini });
    expect(sim.isClear(car)).toBe(true);
    expect(sim.isClear({ ...car, hoverHeight: 0 })).toBe(false);
    expect(garageCarBlocksSegment(car, { x: -3, z: .25 }, { x: 3, z: .25 })).toBe(false);
    sim.setInput('delorean', { throttle: -1, steer: .8, drift: true }); step(sim, 1);
    expect(Math.hypot(car.x - GARAGE_CAR_BAYS.mini.x, car.z - GARAGE_CAR_BAYS.mini.z)).toBeGreaterThan(2);
    expect(sim.marks).toHaveLength(0); expect(car.damage).toBe(0);
    expect(sim.snapshot(6000).cars.find(c => c.id === 'delorean')?.hoverHeight).toBe(1.45);
    expect(sim.isClear({ ...car, x: 12 })).toBe(false);
  });

  it('waits above an obstructed landing instead of descending through another car', () => {
    const sim = new GarageDrivingSimulation(); sim.claim('delorean', 'pilot'); step(sim, 1.2);
    Object.assign(sim.car('mini'), GARAGE_CAR_BAYS.delorean); sim.release('delorean'); step(sim, 3);
    expect(sim.car('delorean')).toMatchObject({ mode: 'returning', hoverHeight: 1.45 });
    Object.assign(sim.car('mini'), GARAGE_CAR_BAYS.mini); step(sim, 3, 6000);
    expect(sim.car('delorean')).toMatchObject({ mode: 'parked', hoverHeight: 0 });
  });

  it.each(['mini', 'delorean'] as const)('can self-park %s after stopping against the front workstations', id => {
    const sim = new GarageDrivingSimulation(); sim.claim(id, 'visitor');
    sim.setInput(id, { throttle: -1, steer: 0, drift: false }); step(sim, 9);
    expect(sim.isClear(sim.car(id))).toBe(true); sim.release(id);
    for (let i = 1; i <= 1800 && sim.car(id).mode !== 'parked'; i++) sim.step(1 / 60, 11_000 + i * 1000 / 60);
    expect(sim.car(id)).toMatchObject({ ...GARAGE_CAR_BAYS[id], mode: 'parked', hoverHeight: 0 });
  });
});

describe('public garage control ownership', () => {
  it('broadcasts a guest DeLorean departure and return once, including fire trails for observers and late joiners', () => {
    const f = setup();
    f.manager.receive(f.a.socket, { type: 'garage_drive', action: 'claim', car: 'delorean' });
    const car = f.manager.simulation.car('delorean');
    Object.assign(car, { x: 10.77, z: 6.8, yaw: Math.PI, hoverHeight: 1.45 });
    let now = 1050;
    while (!car.timeJump && now < 6000) {
      f.time(now); f.manager.receive(f.a.socket, { type: 'garage_drive', action: 'input', car: 'delorean', input: { throttle: 1, steer: 0, drift: false } });
      f.tick(now); now += 50;
    }
    expect(car.timeJump).toBeDefined();
    f.manager.disconnect(f.a.socket);
    for (let end = now + 2200; now < end; now += 50) f.tick(now);
    const frames = f.b.messages.filter(m => m.type === 'garage_drive_state') as unknown as ReturnType<GarageDrivingSimulation['snapshot']>[];
    expect(frames.some(s => s.cars.some(c => c.timeJump?.arrived === false))).toBe(true);
    expect(frames.some(s => s.cars.some(c => c.timeJump?.arrived === true))).toBe(true);
    const marks = frames.flatMap(s => s.marks);
    expect(marks).toHaveLength(40); expect(new Set(marks.map(m => m.id)).size).toBe(40);
    expect(marks.every(m => m.kind === 'fire')).toBe(true);
    expect(car.mode).toBe('parked');
    f.manager.sendActive(f.b.socket);
    expect(f.b.messages.at(-1)).toMatchObject({ replaceMarks: true, marks, cars: expect.arrayContaining([expect.objectContaining({ id: 'delorean', mode: 'parked' })]) });
    f.manager.stop();
  });

  it('broadcasts repairs while all cars are parked, including the final clean state and late joins', () => {
    const f = setup(), car = f.manager.simulation.car('mini'); car.damage = .1;
    for (let i = 1; i <= 200; i++) f.tick(1000 + i * 50);
    const packet = f.b.messages.filter(m => m.type === 'garage_drive_state').at(-1)!;
    const repaired = (packet.cars as { id: string; damage: number }[]).find(c => c.id === 'mini')!;
    expect(repaired.damage).toBeLessThan(.01);
    for (let i = 201; i <= 220; i++) f.tick(1000 + i * 50);
    f.manager.sendActive(f.a.socket);
    expect((f.a.messages.at(-1)!.cars as { id: string; damage: number }[]).find(c => c.id === 'mini')!.damage).toBe(0);
    expect((f.b.messages.filter(m => m.type === 'garage_drive_state').at(-1)!.cars as { id: string; damage: number }[]).find(c => c.id === 'mini')!.damage).toBe(0);
    f.manager.stop();
  });
  it('atomically switches cars, keeps control on occupied-target rejection, and parks previous cars', () => {
    const f = setup(); f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    f.manager.receive(f.b.socket, { action: 'claim', car: 'porsche' });
    const owner = f.manager.simulation.car('mini').driverVisitorId;
    f.time(1100); f.manager.receive(f.a.socket, { action: 'claim', car: 'porsche' });
    expect(f.a.messages.at(-1)).toMatchObject({ success: false });
    expect(f.manager.simulation.car('mini')).toMatchObject({ mode: 'driving', driverVisitorId: owner });
    f.time(1200); f.manager.receive(f.a.socket, { action: 'claim', car: 'delorean' });
    expect(f.manager.simulation.car('mini')).toMatchObject({ mode: 'returning', driverVisitorId: owner });
    expect(f.manager.simulation.car('delorean')).toMatchObject({ mode: 'driving', driverVisitorId: owner });
    f.time(1300); f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input: { throttle: 1, steer: 1, drift: true } });
    expect(f.manager.simulation.car('mini').throttle).toBe(0);
    f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' }); // Catch our own car while it parks.
    expect(f.manager.simulation.car('mini').mode).toBe('driving');
    expect(f.manager.simulation.car('delorean').mode).toBe('returning');
    expect(f.manager.simulation.cars.filter(c => c.driverVisitorId === owner && c.mode === 'driving')).toHaveLength(1);
  });
  it('allows signed-out claims, rejects competing sockets and forged pose/input, and sends a full late-join state', () => {
    const f = setup();
    f.manager.receive(f.a.socket, { type: 'garage_drive', action: 'claim', car: 'mini' });
    const result = f.a.messages.find(m => m.type === 'garage_drive_result')!;
    expect(result.success).toBe(true); expect(result.visitorId).toEqual(expect.any(String));
    f.manager.receive(f.b.socket, { type: 'garage_drive', action: 'claim', car: 'mini' });
    expect(f.b.messages.at(-1)).toMatchObject({ type: 'garage_drive_result', success: false });
    const original = { ...f.manager.simulation.car('mini') };
    for (const input of [{ throttle: 999, steer: 0, drift: true }, { throttle: NaN, steer: 0, drift: true }])
      f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input, x: 100, z: 100 });
    f.manager.receive(f.b.socket, { action: 'input', car: 'mini', input: { throttle: 1, steer: 0, drift: false } });
    f.tick(1100); expect(f.manager.simulation.car('mini')).toMatchObject({ x: original.x, z: original.z });
    f.manager.sendActive(f.b.socket); expect(f.b.messages.at(-1)).toMatchObject({ type: 'garage_drive_state', replaceMarks: true, cars: expect.arrayContaining([expect.objectContaining({ id: 'mini', driverVisitorId: result.visitorId })]) });
    f.time(1400); f.manager.receive(f.b.socket, { action: 'reset', car: 'mini' }); expect(f.b.messages.at(-1)).toMatchObject({ success: false });
  });

  it('neutralizes stale input, returns disconnected cars, and expires an inactive socket lease', () => {
    const f = setup(); f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    f.time(1100); f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input: { throttle: -1, steer: 0, drift: false } });
    f.tick(1200); expect(f.manager.simulation.car('mini').throttle).toBe(-1);
    f.tick(1100 + GARAGE_INPUT_STALE_MS + 1); expect(f.manager.simulation.car('mini').throttle).toBe(0);
    f.manager.disconnect(f.a.socket); expect(f.manager.simulation.car('mini').mode).toBe('returning');
    f.time(2000); f.manager.receive(f.b.socket, { action: 'claim', car: 'f1' });
    f.tick(2000 + GARAGE_LEASE_IDLE_MS + 1); expect(f.manager.simulation.car('f1').mode).not.toBe('driving');
  });

  it.each(['stale input', 'expired lease', 'disconnect'] as const)('keeps a newly claimed car safe from its previous browser\'s %s', event => {
    const f = setup(); f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    f.manager.receive(f.a.socket, { action: 'release', car: 'mini' });
    const parkedAt = event === 'expired lease' ? 2000 + GARAGE_LEASE_IDLE_MS : 2000;
    // Parking completes during simulation.step, after the old peer's lease was checked.
    f.tick(parkedAt); expect(f.manager.simulation.car('mini').mode).toBe('parked');
    f.manager.receive(f.b.socket, { action: 'claim', car: 'mini' });
    const owner = f.manager.simulation.car('mini').driverVisitorId;
    f.time(parkedAt + 30); f.manager.receive(f.b.socket, { action: 'input', car: 'mini', input: { throttle: -1, steer: 0, drift: false } });
    if (event === 'disconnect') f.manager.disconnect(f.a.socket);
    f.tick(parkedAt + 50);
    expect(f.manager.simulation.car('mini')).toMatchObject({ mode: 'driving', driverVisitorId: owner, throttle: -1 });
    expect(Math.hypot(f.manager.simulation.car('mini').vx, f.manager.simulation.car('mini').vz)).toBeGreaterThan(0);
  });

  it('accepts immediate key-up and release while neutral heartbeats cannot renew an unused lease', () => {
    const f = setup(); f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    f.time(1100); f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input: { throttle: -1, steer: 0, drift: false } });
    f.time(1101); f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input: { throttle: 0, steer: 0, drift: false } });
    f.tick(1150); expect(f.manager.simulation.car('mini').throttle).toBe(0);
    for (let time = 1200; time <= 1200 + GARAGE_LEASE_IDLE_MS; time += 75) {
      f.time(time); f.manager.receive(f.a.socket, { action: 'input', car: 'mini', input: { throttle: 0, steer: 0, drift: false } }); f.tick(time);
    }
    expect(f.manager.simulation.car('mini').mode).toBe('parked');
    f.manager.receive(f.b.socket, { action: 'claim', car: 'f1' });
    f.manager.receive(f.b.socket, { action: 'release', car: 'f1' });
    expect(f.b.messages.filter(m => m.type === 'garage_drive_result').at(-1)).toMatchObject({ action: 'release', success: true });
  });

  it('releases immediately but does not rebroadcast unchanged parking state for repeated release requests', () => {
    const f = setup(); f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    const sharedUpdates = () => f.b.messages.filter(m => m.type === 'garage_drive_state').length;
    const before = sharedUpdates();
    f.manager.receive(f.a.socket, { action: 'release', car: 'mini' }); // Same timestamp as claim: still immediate.
    expect(f.manager.simulation.car('mini').mode).toBe('returning');
    expect(sharedUpdates()).toBe(before + 1);
    for (let i = 0; i < 100; i++) f.manager.receive(f.a.socket, { action: 'release', car: 'mini' });
    expect(f.a.messages.filter(m => m.type === 'garage_drive_result' && m.action === 'release')).toHaveLength(101);
    expect(f.a.messages.at(-1)).toMatchObject({ action: 'release', success: true });
    expect(sharedUpdates()).toBe(before + 1);
    f.tick(1100); expect(f.manager.simulation.car('mini').mode).toBe('parked');
    expect(sharedUpdates()).toBe(before + 2);
  });

  it('preserves the exclusive Mini workstation reservation', () => {
    const f = setup(), hook = { hook_event_name: 'SessionStart', session_id: 'jonathan', username: 'jonathanvergara', ownerId: 'owner', cwd: '/factory', avatar: DEFAULT_AVATAR };
    f.state.handleHookEvent(hook); expect(f.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT)).toBe(true);
    f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' }); expect(f.a.messages.at(-1)).toMatchObject({ success: false });
    const g = setup(); g.state.handleHookEvent(hook); g.manager.receive(g.a.socket, { action: 'claim', car: 'mini' });
    expect(g.state.assignWorkstation('jonathan', MINI_WORKSTATION_SLOT)).toBe(false);
  });

  it('pauses pedestrians and manual movement before a driven car, then resumes the exact route when clear', () => {
    const f = setup(); f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'walker', username: 'walker', cwd: '/factory', avatar: DEFAULT_AVATAR });
    const agent = f.state.get('walker')!, from = toFactoryWorld({ x: -3, z: 30 }), to = toFactoryWorld({ x: 3, z: 30 });
    agent.world = { zone: 'idle', position: from, facing: 'right', movement: { from, to, startedAt: 1000, arrivesAt: 4000 } };
    f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' }); Object.assign(f.manager.simulation.car('mini'), { x: 0, z: 6, yaw: 0 });
    f.tick(1900); expect(agent.world.movement).toBeUndefined();
    const held = { ...agent.world.position }; expect(f.state.constrainStep(held, to)).toEqual(held);
    f.tick(2200); expect(agent.world.position).toEqual(held);
    Object.assign(f.manager.simulation.car('mini'), { z: 9 }); f.tick(2300);
    expect(agent.world.movement).toMatchObject({ from, to, startedAt: 1400, arrivesAt: 4400 });
    expect(f.state.getCurrentPosition('walker', 2300)).toEqual(held);
  });

  it.each([false, true])('authoritatively nudges people without changing identity, activity, or manual lease (manual=%s)', manual => {
    const f = setup();
    f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'walker', username: 'walker', ownerId: 'owner', cwd: '/factory', avatar: DEFAULT_AVATAR });
    const agent = f.state.get('walker')!;
    const position = toFactoryWorld({ x: -1.7, z: 31 });
    agent.world = { zone: 'idle', position, facing: 'right' };
    if (manual) agent.manualControl = { ...position, moving: false, facing: 'right' };
    const activity = agent.activity, lastEventAt = agent.lastEventAt, owner = agent.ownerId;
    f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' });
    Object.assign(f.manager.simulation.car('mini'), { x: -3, z: 7, yaw: Math.PI / 2, vx: 5 });
    f.tick(1050);
    expect(agent.world.position.x).toBeGreaterThan(position.x);
    expect(agent).toMatchObject({ activity, lastEventAt, ownerId: owner, sessionId: 'walker' });
    if (manual) expect(agent.manualControl).toMatchObject({ ...agent.world.position, moving: false, facing: 'right' });
    else expect(agent.manualControl).toBeUndefined();
    expect(f.state.getAll()).toHaveLength(1);
    // The public car packet cannot manufacture a displacement or acquire the person's controls.
    const moved = { ...agent.world.position };
    f.manager.receive(f.b.socket, { action: 'input', car: 'mini', input: { throttle: 1, steer: 0, drift: false }, sessionId: 'walker', x: 999, z: 999 });
    expect(agent.world.position).toEqual(moved);
  });

  it('keeps a nudged automatic pedestrian destination and resumes a clear route', () => {
    const f = setup(); f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'walker', username: 'walker', cwd: '/factory', avatar: DEFAULT_AVATAR });
    const agent = f.state.get('walker')!, from = toFactoryWorld({ x: -1.7, z: 31 }), to = toFactoryWorld({ x: -1.7, z: 33 });
    agent.world = { zone: 'idle', position: from, facing: 'down', movement: { from, to, startedAt: 1000, arrivesAt: 11000 } };
    f.manager.receive(f.a.socket, { action: 'claim', car: 'mini' }); Object.assign(f.manager.simulation.car('mini'), { x: -3, z: 7, yaw: Math.PI / 2, vx: 5 });
    f.tick(1050); expect(agent.world.position.x).toBeGreaterThan(from.x);
    Object.assign(f.manager.simulation.car('mini'), { x: -8, z: 7, vx: 0 }); f.tick(1100);
    expect(agent.world.movement?.to).toEqual(to);
    expect(agent.world.movement!.from.x).toBeGreaterThan(from.x);
  });

  it('finishes a parked idle driver with the existing exit animation and no second engine rev', () => {
    const f = setup(); f.state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: 'idle', username: 'idle', cwd: '/factory', avatar: DEFAULT_AVATAR });
    expect(f.state.startIdleGarageCarVisit('idle', 'mini').success).toBe(true);
    const agent = f.state.get('idle')!; f.time(agent.world.carVisit!.startedAt + 5000); f.state.holdGarageDriver('idle');
    f.time(50_000); f.state.finishGarageDriver('idle', true);
    expect(agent.world.carVisit?.startedAt).toBe(41_850); expect(agent.world.movement).toBeUndefined();
    const pose = garageCarVisitPose(50_000 - agent.world.carVisit!.startedAt);
    expect(pose.seat).toBe(1); expect(pose.engine).toBe(false); expect(pose.throttle).toBe(0);
    expect(f.state.isGarageCarReserved('mini')).toBe(true);
    f.time(53_851); f.state.advanceWorld(53_851); expect(agent.world.carVisit).toBeUndefined();
  });

  it('boards a real idle agent after its route, aborts the donut for work, and retains one identity', () => {
    const f = setup(), hook = { hook_event_name: 'SessionStart', session_id: 'jonathan', username: 'jonathanvergara', ownerId: 'owner', cwd: '/factory', avatar: DEFAULT_AVATAR };
    f.state.handleHookEvent(hook);
    f.state.setManualControl('jonathan', { ...toFactoryWorld({ x: .3, z: 30 }), moving: false, facing: 'up' }); f.state.clearManualControl('jonathan');
    f.tick(121_000);
    const visit = f.state.get('jonathan')!.world.carVisit!; expect(visit.car).toBe('mini');
    expect(f.manager.simulation.car('mini').driverSessionId).toBeUndefined();
    f.tick(visit.startedAt + 4051); expect(f.manager.simulation.car('mini')).toMatchObject({ mode: 'donut', driverSessionId: 'jonathan' });
    f.state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    f.tick(visit.startedAt + 4151); expect(f.manager.simulation.car('mini').mode).toBe('returning');
    expect(f.state.getAll()).toHaveLength(1); expect(f.state.get('jonathan')!.activity).toBe('reading');
  });
});

describe('driver-relative steering', () => {
  it.each(GARAGE_CAR_IDS)('%s turns right for positive input in its own forward-facing frame', id => {
    const sim = new GarageDrivingSimulation(); sim.claim(id, 'owner'); step(sim, 1.2); const car = sim.car(id);
    Object.assign(car, { x: 0, z: 7, yaw: 0, vx: 0, vz: 3 });
    sim.setInput(id, { throttle: 0, steer: 1, drift: false }); step(sim, .3);
    expect(car.yaw).toBeLessThan(0); expect(car.steer).toBeLessThan(0); expect(car.x).toBeLessThan(0);
    if (id !== 'delorean') {
      Object.assign(car, { x: 0, z: 7, yaw: 0, steer: 0, vx: 0, vz: -3 }); step(sim, .3);
      expect(car.yaw).toBeGreaterThan(0); expect(car.steer).toBeLessThan(0);
    }
  });
});
