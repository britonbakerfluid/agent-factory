import { PICKUP_FRAME_MS, type PickupFrame, type PickupPose, type PickupTarget, type PickupMessage } from '@shared/pickup-motion';
import { factoryHost, isControlPreview, onFactoryConnection, onFactoryMessage, sendPickupMotion } from './factory25dBoardData';

/** One transport per scene, shared by agent controls and all three staff. */
export class SharedPickupView {
  private frames = new Map<PickupTarget, PickupFrame>();
  private previous = new Map<PickupTarget, PickupFrame>();
  private receivedAt = 0;
  private revision = -1;
  private epoch = '';
  private owned = new Map<PickupTarget, { requestId: string; lease?: string; sequence: number; sentAt: number; requestedAt: number; done: boolean }>();
  constructor(private send: typeof sendPickupMotion, private clock = () => performance.now()) {}
  handle(message: PickupMessage) {
    if (message.type === 'pickup_result') {
      const own = this.owned.get(message.target);
      if (!own || own.requestId !== message.requestId) return;
      if (message.lease) { own.lease = message.lease; if (own.done) this.send({ type: 'pickup_motion', action: 'finish', target: message.target, lease: message.lease }); }
      else this.owned.delete(message.target);
      return;
    }
    if (message.epoch === this.epoch && message.revision <= this.revision) return;
    this.previous = message.epoch === this.epoch ? this.frames : new Map();
    this.epoch = message.epoch; this.revision = message.revision; this.receivedAt = this.clock();
    this.frames = new Map(message.frames.map(frame => [frame.target, frame]));
    for (const [target, own] of this.owned) {
      const frame = this.frames.get(target);
      if (own.lease && (!frame || frame.lease !== own.lease || frame.recovering)) this.owned.delete(target);
    }
  }
  begin(target: PickupTarget) {
    const requestId = crypto.randomUUID();
    if (!this.send({ type: 'pickup_motion', action: 'begin', target, requestId })) return false;
    this.owned.set(target, { requestId, sequence: 0, sentAt: -Infinity, requestedAt: this.clock(), done: false }); return true;
  }
  owns(target: PickupTarget) {
    const own = this.owned.get(target);
    if (own && !own.lease && this.clock() - own.requestedAt > 2000) { this.owned.delete(target); return false; }
    return !!own && !own.done;
  }
  publish(target: PickupTarget, pose: PickupPose) {
    const own = this.owned.get(target), now = this.clock();
    if (!own?.lease || own.done || now - own.sentAt < PICKUP_FRAME_MS) return;
    own.sentAt = now;
    this.send({ type: 'pickup_motion', action: 'pose', target, lease: own.lease, sequence: ++own.sequence, pose });
  }
  finish(target: PickupTarget) {
    const own = this.owned.get(target); if (!own || own.done) return;
    own.done = true;
    if (own.lease) this.send({ type: 'pickup_motion', action: 'finish', target, lease: own.lease });
  }
  sample(target: PickupTarget): PickupPose | undefined {
    if (this.owned.has(target)) return;
    const frame = this.frames.get(target), p = frame?.pose; if (!frame || !p) return;
    const before = this.previous.get(target), a = before?.lease === frame.lease ? before.pose : undefined;
    if (!a || a === p) return p;
    const t = Math.min(1, Math.max(0, this.clock() - this.receivedAt) / PICKUP_FRAME_MS);
    const lerp = (v: number[], b: number[]) => v.map((n, i) => b[i] + (n - b[i]) * t);
    return { ...p, position: lerp(p.position, a.position) as PickupPose['position'],
      scale: lerp(p.scale, a.scale) as PickupPose['scale'], rotation: a.rotation + (p.rotation - a.rotation) * t,
      pin: p.pin && a.pin ? lerp(p.pin, a.pin) as PickupPose['pin'] : p.pin };
  }
  targets() { return this.frames.keys(); }
  reset() { this.owned.clear(); this.previous.clear(); this.frames.clear(); this.epoch = ''; this.revision = -1; }
}
const scenes = new WeakMap<HTMLCanvasElement, SharedPickupView>();
export const sharedPickupFor = (canvas: HTMLCanvasElement) => scenes.get(canvas);
export function installSharedPickups(canvas: HTMLCanvasElement) {
  if (isControlPreview() || factoryHost() !== location.origin) return;
  const view = new SharedPickupView(sendPickupMotion); scenes.set(canvas, view);
  const stop = onFactoryMessage(message => { if (message.type === 'pickup_state' || message.type === 'pickup_result') view.handle(message); });
  const connection = onFactoryConnection(connected => { if (!connected) view.reset(); });
  return { dispose() { stop(); connection(); view.reset(); scenes.delete(canvas); } };
}
