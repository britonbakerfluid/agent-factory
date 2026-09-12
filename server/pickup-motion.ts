import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import { PICKUP_FRAME_MS, validPickupPose, validPickupTarget, type PickupFrame, type PickupRequest, type PickupTarget, type PickupPose } from '../shared/pickup-motion.js';
import type { BroadcastManager } from './ws/broadcast.js';

interface Lease extends PickupFrame {
  socket: WebSocket; inputAt: number; poseAt: number; releasedAt?: number;
  recovery?: { at: number; pose: PickupPose }; finishAt?: number;
}
/** Bounded leases relay the holder's actual spring/cloth pose, including the landing. */
export class PickupMotionManager {
  private leases = new Map<PickupTarget, Lease>();
  private peers = new Map<WebSocket, number>();
  private epoch = randomUUID();
  private revision = 0;
  private dirty = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private broadcast: BroadcastManager, private agentHeld: (socket: WebSocket, id: string) => boolean,
    private now = Date.now) {}
  start() { this.timer ??= setInterval(() => this.tick(), PICKUP_FRAME_MS); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.leases.clear(); this.peers.clear(); }
  busy(target: PickupTarget) { return this.leases.has(target); }
  receive(socket: WebSocket, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const value = raw as PickupRequest;
    if (!validPickupTarget(value.target)) return;
    const now = this.now();
    if (value.action === 'begin') {
      if (typeof value.requestId !== 'string' || !/^[\w-]{1,64}$/.test(value.requestId)) return;
      if (now - (this.peers.get(socket) ?? -Infinity) < 300 || this.peers.size >= 256 && !this.peers.has(socket)) return;
      this.peers.set(socket, now);
      const prior = this.leases.get(value.target);
      const agent = value.target.startsWith('agent:');
      const allowed = agent ? this.agentHeld(socket, value.target.slice(6)) : !prior || !!prior.recovery;
      if (!allowed || this.leases.size >= 16 && !prior) {
        this.broadcast.sendTo(socket, { type: 'pickup_result', target: value.target, requestId: value.requestId }); return;
      }
      // Supersede an old throw only after a fresh agent grab has been granted.
      for (const lease of this.leases.values()) if (lease.socket === socket && lease.target !== value.target) this.recover(lease, now);
      const lease: Lease = { target: value.target, lease: randomUUID(), sequence: -1, socket, inputAt: now, poseAt: -Infinity };
      this.leases.set(value.target, lease); this.dirty = true;
      this.broadcast.sendTo(socket, { type: 'pickup_result', target: value.target, requestId: value.requestId, lease: lease.lease });
      return;
    }
    const lease = this.leases.get(value.target);
    if (!lease || lease.socket !== socket || lease.lease !== value.lease || lease.recovery || lease.finishAt !== undefined) return;
    if (value.action === 'finish') { lease.finishAt = now + 100; return; }
    if (value.action !== 'pose' || now - lease.poseAt < PICKUP_FRAME_MS - 5 || !Number.isSafeInteger(value.sequence)
      || value.sequence <= lease.sequence || !validPickupPose(value.pose)) return;
    const held = value.pose.stage === 'pulling' || value.pose.stage === 'lifted';
    if (value.target.startsWith('agent:') && !this.agentHeld(socket, value.target.slice(6))) {
      lease.releasedAt ??= now;
      if (held || now - lease.releasedAt > 8000) return;
    }
    // Staff have no writable session, work credit, or movement authority.
    const p = value.pose;
    // Copy only the bounded fields. Extra client properties never enter a room broadcast.
    lease.pose = { position: [...p.position], home: [...p.home], scale: [...p.scale], rotation: p.rotation,
      pin: p.pin && [...p.pin], landing: p.landing && [...p.landing], height: p.height,
      stage: p.stage, atlas: p.atlas, uv: [...p.uv] }; lease.sequence = value.sequence;
    lease.poseAt = lease.inputAt = now; this.dirty = true;
  }
  disconnect(socket: WebSocket) {
    this.peers.delete(socket);
    for (const lease of this.leases.values()) if (lease.socket === socket) this.recover(lease, this.now());
  }
  private recover(lease: Lease, now: number) {
    if (lease.recovery) return;
    if (!lease.pose) { this.leases.delete(lease.target); this.dirty = true; return; }
    lease.recovery = { at: now, pose: structuredClone(lease.pose) }; this.dirty = true;
  }
  tick() {
    const now = this.now();
    for (const lease of this.leases.values()) {
      if (lease.finishAt !== undefined && now >= lease.finishAt) { this.leases.delete(lease.target); this.dirty = true; continue; }
      if (!lease.recovery && now - lease.inputAt > 1500) this.recover(lease, now);
      if (!lease.recovery) continue;
      const { at, pose } = lease.recovery, age = (now - at) / 1000;
      const landing = [pose.landing?.[0] ?? pose.position[0], pose.home[1], pose.landing?.[1] ?? pose.position[2]];
      const distance = Math.hypot(...landing.map((n, i) => n - pose.home[i]));
      const t = Math.min(1, age / .65), back = Math.min(1, Math.max(0, age - .65) * 2.1 / Math.max(.01, distance));
      const p = lease.pose!;
      p.position = landing.map((n, i) => age < .65 ? pose.position[i] + (n - pose.position[i]) * t * t : n + (pose.home[i] - n) * back) as PickupPose['position'];
      p.pin = null; p.rotation = 0; p.scale = [1, 1, 1]; p.stage = age < .65 ? 'falling' : 'returning';
      lease.sequence++; this.dirty = true;
      if (back === 1) this.leases.delete(lease.target);
    }
    if (this.dirty) { this.revision++; this.broadcast.broadcastPickup(this.snapshot()); this.dirty = false; }
  }
  snapshot(): Extract<import('../shared/pickup-motion.js').PickupMessage, { type: 'pickup_state' }> {
    return { type: 'pickup_state', epoch: this.epoch, revision: this.revision,
      frames: [...this.leases.values()].map(({ target, lease, sequence, pose, recovery }) => ({ target, lease, sequence, pose, recovering: !!recovery })) };
  }
  sendActive(socket: WebSocket) { this.broadcast.sendTo(socket, this.snapshot()); }
}
