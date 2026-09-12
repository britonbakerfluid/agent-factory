import { FRONT_COUNTER, FRONT_VENDING, INTERIOR_Z, type RoomPoint } from './factory25d-layout.js';

export const ROOM_LIGHT_IDS = [
  'workspace-ceiling', 'front-desk-lamp', 'lounge-floor-lamp', 'lounge-candle',
  'garage-wall-lights', 'garage-workbench-light', 'garage-reading-lamp',
  ...Array.from({ length: 7 }, (_, i) => `patio-lantern-${i + 1}`),
  'patio-canopy-lamp-1', 'patio-canopy-lamp-2', 'patio-fire-bowl',
] as const;
export const FALLING_ROOM_LIGHTS: Record<string, { axis: 'x' | 'z'; point: RoomPoint; standAt: RoomPoint; label: string }> = {
  'front-desk-lamp': { axis: 'z', point: { x: FRONT_COUNTER.x - 1.14, z: FRONT_COUNTER.z - .04 },
    standAt: { x: FRONT_COUNTER.x - 1.14, z: FRONT_COUNTER.z - .62 }, label: 'front desk lamp' },
  'lounge-floor-lamp': { axis: 'x', point: { x: 5.05, z: 5.18 + INTERIOR_Z },
    standAt: { x: 5.7, z: 5.18 + INTERIOR_Z }, label: 'lounge floor lamp' },
  'lounge-candle': { axis: 'x', point: { x: 2.25, z: 5.9 + INTERIOR_Z },
    standAt: { x: 1.55, z: 5.9 + INTERIOR_Z }, label: 'lounge candle' },
};
export const FIXTURE_FALL_MS = 900;
export const FIXTURE_RECOVER_MS = 720;
export const SNACK_CARRY_MS = 21_200;
export type PropVector = [number, number, number];
export interface SharedRoomLight {
  id: string;
  /** Null preserves the automatic ceiling lighting until the first manual choice. */
  on: boolean | null;
  presses: number;
  changedAt: number;
  fallenAt: number | null;
  recoverAt: number | null;
}
export interface SharedSnackBody {
  id: number;
  position: PropVector;
  quaternion: [number, number, number, number];
  velocity: PropVector;
  sleeping: boolean;
  supported: boolean;
}
export interface SharedHeldSnack { sessionId: string; id: number; since: number; from: PropVector }
export interface SharedCleanup {
  phase: 'idle' | 'walking' | 'cleaning' | 'returning';
  position: RoomPoint;
  motion: RoomPoint;
  facing: RoomPoint;
  job?: { id: string; label: string };
}
export type RoomPropRequest = { type: 'room_prop'; requestId: string } & (
  { action: 'light'; id: string; on: boolean } | { action: 'dispense' }
);
export interface RoomPropResult { type: 'room_prop_result'; requestId: string; success: boolean; error?: string }
export interface RoomPropsState {
  type: 'room_props_state'; epoch: string; revision: number; serverTime: number;
  lights: SharedRoomLight[];
  bodies: SharedSnackBody[];
  queued: number;
  dispenses: number;
  held: SharedHeldSnack[];
  cleanup: SharedCleanup;
}
export function validRoomPropRequest(value: unknown): value is RoomPropRequest {
  if (!value || typeof value !== 'object') return false;
  const m = value as RoomPropRequest;
  return m.type === 'room_prop' && typeof m.requestId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(m.requestId)
    && (m.action === 'dispense' || m.action === 'light' && ROOM_LIGHT_IDS.includes(m.id) && typeof m.on === 'boolean');
}
/** Match the visible machine's rotation; no client-provided world coordinates. */
export function snackWorldPoint(local: PropVector): RoomPoint {
  const c = Math.cos(FRONT_VENDING.rotationY), s = Math.sin(FRONT_VENDING.rotationY);
  return { x: FRONT_VENDING.x + local[0] * c + local[2] * s, z: FRONT_VENDING.z - local[0] * s + local[2] * c };
}
export function inFrontOfVending(point: RoomPoint) {
  return (point.x - FRONT_VENDING.x) * Math.sin(FRONT_VENDING.rotationY)
    + (point.z - FRONT_VENDING.z) * Math.cos(FRONT_VENDING.rotationY) > .39;
}
