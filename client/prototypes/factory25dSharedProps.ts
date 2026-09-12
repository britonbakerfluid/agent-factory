import * as THREE from 'three';
import type { RoomPropRequest, RoomPropsState } from '@shared/room-props';
import type { VendingCanBody } from '@shared/factory25d-vending-physics';
import { factoryHost, isControlPreview, onFactoryConnection, onFactoryMessage, sendRoomProp } from './factory25dBoardData';

type PropAction = { action: 'light'; id: string; on: boolean } | { action: 'dispense' };
export interface SharedPropsConnection {
  readonly state: RoomPropsState | undefined;
  readonly bodiesRevision: number;
  now(): number;
  send(action: PropAction, result?: (success: boolean, error?: string) => void): boolean;
  sampleBodies(): readonly VendingCanBody[];
  cleanup(): RoomPropsState['cleanup'] | undefined;
  dispose(): void;
}

/** Interpolate server poses without running a second physics/ownership simulation. */
export class RoomPropsView {
  state?: RoomPropsState;
  private previous?: RoomPropsState;
  private receivedAt = 0;
  private bodies = new Map<number, VendingCanBody>();
  private quaternion = new THREE.Quaternion();
  private position = new THREE.Vector3();
  private bodyPrevious = new Map<number, RoomPropsState['bodies'][number]>();
  private bodyCurrent: RoomPropsState['bodies'] = [];
  private bodyReceivedAt = 0;
  private bodySpan = 0;
  private sampledBlend = -1;
  private sampled: VendingCanBody[] = [];
  bodiesRevision = 0;
  constructor(private clock = () => performance.now()) {}
  push(state: RoomPropsState) {
    if (this.state?.epoch === state.epoch && (state.revision < this.state.revision || state.serverTime < this.state.serverTime)) return;
    const sameEpoch = this.state?.epoch === state.epoch;
    // Lights and carried snacks keep publishing after the pile sleeps. Those
    // snapshots must not restart its interpolation or upload identical matrices.
    if (!sameEpoch || JSON.stringify(state.bodies) !== JSON.stringify(this.bodyCurrent)) {
      this.bodyPrevious = new Map(sameEpoch ? this.bodyCurrent.map(body => [body.id, body]) : []);
      this.bodyCurrent = state.bodies;
      this.bodySpan = sameEpoch && this.state ? state.serverTime - this.state.serverTime : 0;
      this.bodyReceivedAt = this.clock(); this.sampledBlend = -1;
    }
    this.previous = sameEpoch ? this.state : undefined;
    this.state = state; this.receivedAt = this.clock();
  }
  now() { return this.state ? this.state.serverTime + Math.min(500, Math.max(0, this.clock() - this.receivedAt)) : Date.now(); }
  private blend() {
    const span = this.previous && this.state ? this.state.serverTime - this.previous.serverTime : 0;
    return span > 0 && span <= 250 ? Math.min(1, Math.max(0, this.clock() - this.receivedAt) / span) : 1;
  }
  sampleBodies() {
    const current = this.bodyCurrent;
    const blend = this.bodySpan > 0 && this.bodySpan <= 250
      ? Math.min(1, Math.max(0, this.clock() - this.bodyReceivedAt) / this.bodySpan) : 1;
    if (blend === this.sampledBlend) return this.sampled;
    this.sampledBlend = blend; this.bodiesRevision++;
    const old = this.bodyPrevious;
    const seen = new Set<number>();
    for (const value of current) {
      seen.add(value.id);
      let body = this.bodies.get(value.id);
      if (!body) {
        body = { id: value.id, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), velocity: new THREE.Vector3(),
          angularVelocity: new THREE.Vector3(), quietTime: 0, supported: false, sleeping: value.sleeping };
        this.bodies.set(value.id, body);
      }
      const before = old.get(value.id);
      body.position.fromArray(value.position); body.quaternion.fromArray(value.quaternion).normalize();
      if (before && blend < 1) {
        body.position.multiplyScalar(blend).addScaledVector(this.position.fromArray(before.position), 1 - blend);
        body.quaternion.slerp(this.quaternion.fromArray(before.quaternion).normalize(), 1 - blend);
      }
      body.velocity.fromArray(value.velocity); body.sleeping = value.sleeping; body.supported = value.supported;
    }
    for (const id of this.bodies.keys()) if (!seen.has(id)) this.bodies.delete(id);
    this.sampled = [...this.bodies.values()];
    return this.sampled;
  }
  cleanup() {
    const value = this.state?.cleanup; if (!value) return;
    const before = this.previous?.cleanup.position, t = this.blend();
    return { ...value, position: before ? { x: before.x + (value.position.x - before.x) * t,
      z: before.z + (value.position.z - before.z) * t } : value.position };
  }
}

export function createSharedProps(): SharedPropsConnection | undefined {
  // The isolated playground still supports props without a server and never writes to the live feed.
  if (isControlPreview() || factoryHost() !== location.origin) return;
  const view = new RoomPropsView();
  const pending = new Map<string, { callback?: (success: boolean, error?: string) => void; timer: ReturnType<typeof setTimeout> }>();
  const stopMessages = onFactoryMessage(message => {
    if (message.type === 'room_props_state') view.push(message);
    if (message.type === 'room_prop_result') {
      const request = pending.get(message.requestId); if (!request) return;
      clearTimeout(request.timer); pending.delete(message.requestId); request.callback?.(message.success, message.error);
    }
  });
  const clearPending = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.callback?.(false); }
    pending.clear();
  };
  const stopConnection = onFactoryConnection(connected => { if (!connected) clearPending(); });
  return {
    get state() { return view.state; }, get bodiesRevision() { return view.bodiesRevision; }, now: () => view.now(), sampleBodies: () => view.sampleBodies(), cleanup: () => view.cleanup(),
    send(action, callback) {
      if (!view.state || pending.size >= 32) return false;
      const requestId = crypto.randomUUID();
      const request: RoomPropRequest = { type: 'room_prop', requestId, ...action };
      if (!sendRoomProp(request)) return false;
      const timer = setTimeout(() => { pending.delete(requestId); callback?.(false); }, 3000);
      pending.set(requestId, { callback, timer }); return true;
    },
    dispose() { stopMessages(); stopConnection(); clearPending(); },
  };
}
