/** Ephemeral rendered poses; agent permissions still belong to the grab manager. */
export type PickupTarget = `agent:${string}` | 'staff:milo' | 'staff:june' | 'staff:remy';
export type PickupVector = [number, number, number];
export type PickupStage = 'pulling' | 'lifted' | 'falling' | 'landing' | 'dunking' | 'returning';
export interface PickupPose {
  position: PickupVector;
  home: PickupVector;
  scale: PickupVector;
  rotation: number;
  pin: PickupVector | null;
  landing: [number, number] | null;
  height: number;
  stage: PickupStage;
  atlas: 'normal' | 'landing' | 'walk';
  uv: [number, number, number, number];
}
export interface PickupFrame { target: PickupTarget; lease: string; sequence: number; recovering?: boolean; pose?: PickupPose }
export type PickupRequest =
  | { type: 'pickup_motion'; action: 'begin'; target: PickupTarget; requestId: string }
  | { type: 'pickup_motion'; action: 'pose'; target: PickupTarget; lease: string; sequence: number; pose: PickupPose }
  | { type: 'pickup_motion'; action: 'finish'; target: PickupTarget; lease: string };
export type PickupMessage =
  | { type: 'pickup_result'; target: PickupTarget; requestId: string; lease?: string }
  | { type: 'pickup_state'; epoch: string; revision: number; frames: PickupFrame[] };
export const PICKUP_FRAME_MS = 50;
export function validPickupTarget(value: unknown): value is PickupTarget {
  return typeof value === 'string' && (/^agent:[\w.-]{1,160}$/.test(value) || ['staff:milo', 'staff:june', 'staff:remy'].includes(value));
}
export function validPickupPose(value: unknown): value is PickupPose {
  if (!value || typeof value !== 'object') return false;
  const p = value as PickupPose;
  const vector = (v: unknown, length: number, min: number, max: number) => Array.isArray(v) && v.length === length && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max);
  return vector(p.position, 3, -60, 60) && vector(p.home, 3, -60, 60)
    && vector(p.scale, 3, .05, 3) && Number.isFinite(p.rotation) && Math.abs(p.rotation) <= Math.PI * 4
    && (p.pin === null || vector(p.pin, 3, -60, 60)) && (p.landing === null || vector(p.landing, 2, -60, 60))
    && Number.isFinite(p.height) && p.height >= 0 && p.height <= 20
    && ['pulling', 'lifted', 'falling', 'landing', 'dunking', 'returning'].includes(p.stage)
    && ['normal', 'landing', 'walk'].includes(p.atlas) && vector(p.uv, 4, 0, 1) && p.uv[2] > 0 && p.uv[3] > 0;
}
