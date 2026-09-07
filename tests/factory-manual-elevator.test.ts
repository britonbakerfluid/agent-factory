import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { ControlManager } from '../server/control-manager.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import { StateManager } from '../server/state.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import { FACTORY_ELEVATOR, GARAGE_ELEVATOR, fromFactoryWorld, toFactoryWorld, factoryRoomAt, factoryMovementIsClear } from '../shared/factory25d-layout.js';
import { MANUAL_ELEVATOR_DURATION_MS, MANUAL_ELEVATOR_SWITCH_MS, manualElevatorEntry, manualElevatorLanding } from '../shared/factory25d-manual-travel.js';
import type { ControlInputState, ManualElevatorTrip, WSMessageToClient } from '../shared/types.js';

const neutral: ControlInputState = { up: false, down: false, left: false, right: false };
const up: ControlInputState = { ...neutral, up: true };
const down: ControlInputState = { ...neutral, down: true };

function socket() {
  const sent: WSMessageToClient[] = [];
  return { readyState: 1, sent, send(raw: string) { sent.push(JSON.parse(raw)); }, on() {} } as unknown as WebSocket & { sent: WSMessageToClient[] };
}

function fixture(floor: 'factory' | 'garage' = 'factory') {
  let now = 10000;
  const state = new StateManager('factory25d', () => now);
  const controls = new ControlManager(state, new BroadcastManager(), () => now);
  const hook = { hook_event_name: 'SessionStart', session_id: 'passenger', username: 'alice', ownerId: 'owner', cwd: '/factory', avatar: DEFAULT_AVATAR };
  state.handleHookEvent(hook);
  const agent = () => state.get(hook.session_id)!;
  const position = toFactoryWorld(floor === 'garage' ? GARAGE_ELEVATOR : FACTORY_ELEVATOR);
  agent().world = { zone: 'idle', position, facing: 'up' };
  const ws = socket();
  controls.claim(ws, 'owner', hook.session_id);
  return {
    state, controls, ws, agent, hook, position,
    now: () => now,
    advance(ms: number) { now += ms; controls.tick(now); },
    setTime(timestamp: number) { now = timestamp; },
    input(input: ControlInputState, client = ws, owner = 'owner') { return controls.updateInput(client, owner, hook.session_id, input); },
    enter() {
      controls.updateInput(ws, 'owner', hook.session_id, up);
      now += 200; controls.tick(now);
      expect(agent().manualControl?.elevatorTrip).toBeDefined();
      return agent().manualControl!.elevatorTrip!;
    },
  };
}

describe('manual elevator entry geometry', () => {
  it.each([FACTORY_ELEVATOR, GARAGE_ELEVATOR])('requires an upward crossing through the opening at $x', door => {
    const from = toFactoryWorld(door), to = toFactoryWorld({ ...door, z: door.z - .5 });
    const entry = manualElevatorEntry(from, to)!;
    expect(entry.departure).toEqual(from);
    expect(entry.arrival).toEqual(toFactoryWorld(door === FACTORY_ELEVATOR ? GARAGE_ELEVATOR : FACTORY_ELEVATOR));
    expect(manualElevatorEntry(to, from)).toBeUndefined();
    expect(manualElevatorEntry(from, toFactoryWorld({ ...door, z: door.z - .1 }))).toBeUndefined();
    expect(manualElevatorEntry(toFactoryWorld({ ...door, x: door.x + .5 }), to)).toBeUndefined();
    expect(manualElevatorEntry(from, toFactoryWorld({ x: door.x + .5, z: door.z - .5 }))).toBeUndefined();
    expect(manualElevatorEntry(toFactoryWorld({ x: door.x - .1, z: door.z - .6 }), to)).toBeUndefined();
  });

  it('rejects side entry, the patio, a floor jump, and invalid coordinates', () => {
    expect(manualElevatorEntry(toFactoryWorld({ x: -7.3, z: -3.3 }), toFactoryWorld({ x: -6.7, z: -3.3 }))).toBeUndefined();
    expect(manualElevatorEntry(toFactoryWorld({ x: 10, z: -3 }), toFactoryWorld({ x: 10, z: -3.5 }))).toBeUndefined();
    expect(manualElevatorEntry(toFactoryWorld(FACTORY_ELEVATOR), toFactoryWorld(GARAGE_ELEVATOR))).toBeUndefined();
    expect(manualElevatorEntry({ x: NaN, y: 64 }, { x: 52, y: 20 })).toBeUndefined();
  });

  it('settles only at one of the two endpoints at the camera switch', () => {
    const trip: ManualElevatorTrip = { departure: toFactoryWorld(FACTORY_ELEVATOR), arrival: toFactoryWorld(GARAGE_ELEVATOR), startedAt: 1000, arrivesAt: 2770 };
    expect(manualElevatorLanding(trip, 1000 + MANUAL_ELEVATOR_SWITCH_MS - 1)).toEqual(trip.departure);
    expect(manualElevatorLanding(trip, 1000 + MANUAL_ELEVATOR_SWITCH_MS)).toEqual(trip.arrival);
    expect(manualElevatorLanding(trip, 5000)).toEqual(trip.arrival);
  });
});

describe('authoritative manual elevator leases', () => {
  it.each(['factory', 'garage'] as const)('carries the controlled passenger from %s, then safely walks away', floor => {
    const f = fixture(floor), trip = f.enter();
    expect(trip.arrivesAt - trip.startedAt).toBe(MANUAL_ELEVATOR_DURATION_MS);
    expect(f.agent().manualControl).toMatchObject({ ...trip.departure, moving: false, facing: 'up' });
    expect(f.agent().world.movement).toBeUndefined();
    f.advance(MANUAL_ELEVATOR_SWITCH_MS);
    expect(f.state.getCurrentPosition('passenger')).toEqual(trip.arrival);
    expect(f.input(down)).toBe(true);
    expect(f.controls.shoot(f.ws, 'owner', 'passenger')).toBe(false);
    f.advance(MANUAL_ELEVATOR_DURATION_MS - MANUAL_ELEVATOR_SWITCH_MS);
    expect(f.agent().manualControl).toEqual({ ...trip.arrival, facing: 'down', moving: false });
    expect(f.agent().world.position).toEqual(trip.arrival);
    expect(f.agent().world.movement).toBeUndefined();
    f.input(up); f.advance(200);
    expect(f.agent().manualControl).toEqual({ ...trip.arrival, facing: 'down', moving: false });
    f.input(neutral); f.input(down); f.advance(200);
    expect(f.agent().manualControl!.y).toBeGreaterThan(trip.arrival.y);
    expect(f.agent().manualControl?.elevatorTrip).toBeUndefined();
    expect(factoryRoomAt(fromFactoryWorld(f.agent().manualControl!))).toBe(floor === 'factory' ? 'garage' : 'factory');
    expect(f.controls.shoot(f.ws, 'owner', 'passenger')).toBe(true);
  });

  it('requires release and a fresh directional press before a return ride', () => {
    const f = fixture(), trip = f.enter();
    f.input(neutral); // Neutral during transit must not re-arm a held key on arrival.
    f.advance(MANUAL_ELEVATOR_DURATION_MS);
    f.input(up); f.advance(200);
    expect(f.agent().manualControl?.elevatorTrip).toBeUndefined();
    f.input(neutral); f.input(up); f.advance(200);
    expect(f.agent().manualControl?.elevatorTrip?.arrival).toEqual(trip.departure);
  });

  it.each([200, 900])('settles a disconnect after %i ms and resumes only valid floor routes', elapsed => {
    const f = fixture(), trip = f.enter();
    f.advance(elapsed);
    const landing = manualElevatorLanding(trip, f.now());
    f.controls.releaseSocket(f.ws, 'disconnect');
    expect(f.agent().manualControl).toBeUndefined();
    expect(f.agent().world.movement?.from ?? f.agent().world.position).toEqual(landing);
    if (f.agent().world.movement) expect(factoryMovementIsClear(f.agent().world.movement!)).toBe(true);
    expect(f.input(up)).toBe(false);
  });

  it('settles an explicit release, keeps real hook activity, and never creates a shaft walking origin', () => {
    const f = fixture(), trip = f.enter();
    f.advance(1000);
    f.state.handleHookEvent({ ...f.hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
    expect(f.agent().manualControl?.elevatorTrip).toEqual(trip);
    expect(f.agent().world.position).toEqual(trip.arrival);
    expect(f.controls.release(f.ws, 'owner', 'passenger')).toBe(true);
    expect(f.agent().activity).toBe('reading');
    expect(f.agent().manualControl).toBeUndefined();
    expect(f.agent().world.movement?.from ?? f.agent().world.position).toEqual(trip.arrival);
    if (f.agent().world.movement) expect(factoryMovementIsClear(f.agent().world.movement!)).toBe(true);
  });

  it('transfers control to a second owned browser at the nearest door and revokes the first browser', () => {
    const f = fixture(), trip = f.enter(), next = socket();
    f.advance(900);
    expect(f.controls.claim(next, 'stranger', 'passenger')).toBe(false);
    expect(f.agent().manualControl?.elevatorTrip).toEqual(trip);
    expect(f.controls.claim(next, 'owner', 'passenger')).toBe(true);
    expect(f.agent().manualControl).toEqual({ ...trip.arrival, facing: 'down', moving: false });
    expect(f.ws.sent).toContainEqual(expect.objectContaining({ type: 'control_revoked' }));
    expect(f.input(up)).toBe(false);
    expect(f.input(down, next)).toBe(true);
    f.advance(100);
    expect(f.agent().manualControl!.y).toBeGreaterThan(trip.arrival.y);
  });

  it.each(['stopped', 'owner-changed'] as const)('safely cancels a trip when the session is %s', reason => {
    const f = fixture(), trip = f.enter();
    f.advance(900);
    if (reason === 'stopped') f.agent().activity = 'stopped';
    else f.agent().ownerId = 'new-owner';
    f.advance(50);
    expect(f.agent().manualControl).toBeUndefined();
    expect(f.agent().world.movement?.from ?? f.agent().world.position).toEqual(trip.arrival);
    expect(f.input(up)).toBe(false);
  });

  it('copies the safe automatic-elevator claim correction into the control lease', () => {
    const f = fixture();
    f.controls.release(f.ws, 'owner', 'passenger');
    const departure = toFactoryWorld(FACTORY_ELEVATOR), arrival = toFactoryWorld(GARAGE_ELEVATOR);
    f.agent().world = { zone: 'idle', position: departure, facing: 'up', movement: { from: departure, to: arrival, startedAt: f.now(), arrivesAt: f.now() + 2000 } };
    f.setTime(f.now() + 1200);
    expect(f.controls.claim(f.ws, 'owner', 'passenger')).toBe(true);
    expect(f.agent().manualControl).toMatchObject(arrival);
    f.input(down); f.advance(100);
    expect(f.agent().manualControl!.y).toBeCloseTo(arrival.y + 8);
    expect(f.agent().manualControl!.x).toBeCloseTo(arrival.x);
  });

  it('retains collision-constrained walking outside the door and never activates in the arcade', () => {
    const f = fixture();
    f.controls.release(f.ws, 'owner', 'passenger');
    const away = toFactoryWorld({ x: FACTORY_ELEVATOR.x + .7, z: -3 });
    f.agent().world = { zone: 'idle', position: away, facing: 'up' };
    f.controls.claim(f.ws, 'owner', 'passenger');
    f.input(up); f.advance(200);
    expect(f.agent().manualControl?.elevatorTrip).toBeUndefined();
    expect(f.agent().manualControl!.y).toBeCloseTo(away.y - 16);
    const arcade = new StateManager('arcade');
    expect(arcade.manualElevatorEntry(toFactoryWorld(FACTORY_ELEVATOR), toFactoryWorld({ ...FACTORY_ELEVATOR, z: -3.4 }))).toBeUndefined();
    expect(f.state.constrainStep(toFactoryWorld(FACTORY_ELEVATOR), toFactoryWorld(GARAGE_ELEVATOR))).not.toEqual(toFactoryWorld(GARAGE_ELEVATOR));
  });
});
