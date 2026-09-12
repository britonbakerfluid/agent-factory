import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import { FRONT_COUNTER, factoryRoomAt, fromFactoryWorld } from '../shared/factory25d-layout.js';
import { StaffCleanup } from '../shared/factory25d-staff-cleanup.js';
import { VendingPilePhysics, VENDING_PILE_LIMIT } from '../shared/factory25d-vending-physics.js';
import { FALLING_ROOM_LIGHTS, FIXTURE_FALL_MS, FIXTURE_RECOVER_MS, ROOM_LIGHT_IDS, SNACK_CARRY_MS,
  inFrontOfVending, snackWorldPoint, validRoomPropRequest, type RoomPropsState, type SharedHeldSnack,
  type SharedRoomLight, type PropVector, type RoomPropResult } from '../shared/room-props.js';
import type { StateManager } from './state.js';
import type { BroadcastManager } from './ws/broadcast.js';

/** The server owns lights, rigid bodies and snack transfers. Browsers only request a switch or a dispense. */
export class RoomPropsManager {
  readonly pile = new VendingPilePhysics();
  readonly lights = new Map<string, SharedRoomLight>(ROOM_LIGHT_IDS.map(id => [id,
    { id, on: id === 'workspace-ceiling' ? null : true, presses: 0, changedAt: 0, fallenAt: null, recoverAt: null }]));
  readonly cleanup = new StaffCleanup({ x: FRONT_COUNTER.x + .65, z: FRONT_COUNTER.z - .6 });
  private held = new Map<string, SharedHeldSnack>();
  private nextPickup = new Map<string, number>();
  private taps = new Map<string, { count: number; at: number }>();
  private peers = new Map<WebSocket, { tokens: number; at: number; results: Map<string, RoomPropResult> }>();
  private epoch = randomUUID();
  private revision = 0;
  private dispenses = 0;
  private timer?: ReturnType<typeof setInterval>;
  private previous: number;
  private broadcastAt = -Infinity;
  private dirty = true;
  private enabled: boolean;
  constructor(private state: StateManager, private broadcast: BroadcastManager, private now = Date.now) {
    this.enabled = state.getSnapshot().environment === 'factory25d';
    this.previous = now();
  }
  start() { if (this.enabled && !this.timer) this.timer = setInterval(() => this.tick(), 50); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.peers.clear(); this.cleanup.dispose(); }
  disconnect(socket: WebSocket) { this.peers.delete(socket); }
  sendActive(socket: WebSocket) { if (this.enabled) this.broadcast.sendTo(socket, this.snapshot()); }
  receive(socket: WebSocket, value: unknown) {
    if (!this.enabled || !validRoomPropRequest(value)) return;
    const now = this.now();
    let peer = this.peers.get(socket);
    if (!peer) {
      if (this.peers.size >= 256) return;
      peer = { tokens: 8, at: now, results: new Map() }; this.peers.set(socket, peer);
    }
    const prior = peer.results.get(value.requestId);
    if (prior) { this.broadcast.sendTo(socket, prior); return; }
    peer.tokens = Math.min(8, peer.tokens + Math.max(0, now - peer.at) * .008); peer.at = now;
    // Discard floods before sending replies or snapshots. A normal flurry of four taps still tips a lamp.
    if (peer.tokens < 1) return;
    peer.tokens--;
    let success = true;
    if (value.action === 'dispense') {
      success = this.pile.bodies.length + this.pile.queued + this.held.size < VENDING_PILE_LIMIT && this.pile.dispense();
      if (success) this.dispenses++;
    } else {
      const light = this.lights.get(value.id)!;
      light.on = value.on; light.presses++; light.changedAt = now;
      if (FALLING_ROOM_LIGHTS[value.id] && light.fallenAt === null) {
        const last = this.taps.get(value.id), count = last && now - last.at <= 1200 ? last.count + 1 : 1;
        this.taps.set(value.id, { count, at: now });
        if (count >= 4) { light.fallenAt = now; light.recoverAt = null; this.taps.delete(value.id); }
      }
    }
    const result: RoomPropResult = { type: 'room_prop_result', requestId: value.requestId, success,
      ...(!success ? { error: 'The pickup area is full.' } : {}) };
    peer.results.set(value.requestId, result);
    if (peer.results.size > 64) peer.results.delete(peer.results.keys().next().value!);
    this.broadcast.sendTo(socket, result);
    if (success) { this.dirty = true; this.flush(now); }
  }
  tick() {
    if (!this.enabled) return;
    const now = this.now(), dt = Math.min(.1, Math.max(0, (now - this.previous) / 1000)); this.previous = now;
    const moving = this.pile.queued > 0 || this.pile.bodies.some(body => !body.sleeping);
    this.pile.update(dt);
    for (const light of this.lights.values()) {
      if (light.fallenAt === null) continue;
      this.dirty = true;
      if (light.recoverAt !== null) {
        if (now - light.recoverAt >= FIXTURE_RECOVER_MS) { light.fallenAt = light.recoverAt = null; }
      } else if (now - light.fallenAt >= FIXTURE_FALL_MS) {
        this.cleanup.enqueue({ id: light.id, ...FALLING_ROOM_LIGHTS[light.id],
          isPending: () => light.fallenAt !== null && light.recoverAt === null,
          recover: () => { light.recoverAt = this.now(); this.dirty = true; } });
      }
    }
    const cleaning = this.cleanup.phase !== 'idle';
    this.cleanup.update(dt, true);
    this.updateCarriers(now);
    this.dirty ||= moving || cleaning || this.cleanup.phase !== 'idle' || this.held.size > 0;
    this.flush(now);
  }
  private updateCarriers(now: number) {
    const agents = this.state.getAll();
    const seen = new Set(agents.map(agent => agent.sessionId));
    for (const agent of agents) {
      const id = agent.sessionId, item = this.held.get(id);
      const available = agent.activity !== 'stopped' && (agent.activity === 'idle' || !!agent.manualControl)
        && !this.state.isSessionGrabbed(id) && !agent.world.carVisit && !agent.world.miniWork && !agent.manualControl?.elevatorTrip;
      if (item && (!available || now - item.since >= SNACK_CARRY_MS)) {
        this.held.delete(id); this.nextPickup.set(id, now + 12_000); this.dirty = true;
      }
      if (!available || this.held.has(id) || now < (this.nextPickup.get(id) ?? 0)) continue;
      const current = this.state.getCurrentPosition(id, now); if (!current) continue;
      const p = fromFactoryWorld(current);
      if (factoryRoomAt(p) !== 'factory' || !inFrontOfVending(p)) continue;
      const body = this.pile.bodies.filter(body => body.position.y <= .16 && (body.sleeping || body.velocity.lengthSq() <= .0225))
        .map(body => ({ body, point: snackWorldPoint(body.position.toArray() as PropVector) }))
        .map(({ body, point }) => ({ body, distance: Math.hypot(point.x - p.x, point.z - p.z) }))
        .filter(({ distance }) => distance < .43).sort((a, b) => a.distance - b.distance)[0]?.body;
      if (body && this.pile.take(body.id)) {
        this.held.set(id, { sessionId: id, id: body.id, since: now, from: body.position.toArray() as PropVector }); this.dirty = true;
      }
    }
    for (const id of this.held.keys()) if (!seen.has(id)) { this.held.delete(id); this.dirty = true; }
    for (const [id, until] of this.nextPickup) if (!seen.has(id) || now >= until) this.nextPickup.delete(id);
  }
  snapshot(): RoomPropsState {
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return { type: 'room_props_state', epoch: this.epoch, revision: this.revision, serverTime: this.now(),
      lights: [...this.lights.values()].map(light => ({ ...light })),
      bodies: this.pile.bodies.map(body => ({ id: body.id, position: body.position.toArray().map(round) as PropVector,
        quaternion: body.quaternion.toArray().map(round) as [number, number, number, number],
        velocity: body.velocity.toArray().map(round) as PropVector, sleeping: body.sleeping, supported: body.supported })),
      queued: this.pile.queued, dispenses: this.dispenses, held: [...this.held.values()].map(item => ({ ...item, from: [...item.from] })),
      cleanup: { phase: this.cleanup.phase, position: { ...this.cleanup.position }, motion: { ...this.cleanup.motion },
        facing: { ...this.cleanup.facing }, ...(this.cleanup.job ? { job: { id: this.cleanup.job.id, label: this.cleanup.job.label } } : {}) },
    };
  }
  private flush(now: number) {
    if (!this.dirty || now - this.broadcastAt < 100) return;
    this.revision++; this.broadcast.broadcastRoomProps(this.snapshot()); this.broadcastAt = now; this.dirty = false;
  }
}
