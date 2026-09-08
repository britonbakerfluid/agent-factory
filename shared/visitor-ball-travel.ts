import type { FactoryRoom } from './factory25d-layout.js';
import { VISITOR_BALL_RADIUS, type BallVector } from './visitor-basketball.js';

/** Only authored doorways connect rooms; every other wall remains solid. */
export function visitorBallExit(p: BallVector, room: FactoryRoom) {
  if (room !== 'patio' && p.y < 1.3 && Math.abs(p.x - (room === 'factory' ? -7.1 : -10.5)) < .46
    && p.z < (room === 'factory' ? -5.05 : -3.1)) {
    const target: FactoryRoom = room === 'factory' ? 'garage' : 'factory';
    return { kind: 'elevator' as const, room: target,
      position: { x: target === 'garage' ? -10.5 : -7.1, y: VISITOR_BALL_RADIUS, z: target === 'garage' ? -3 : -4.95 } };
  }
  if (p.y < 2 && (room === 'factory' && p.x > 7.6 && Math.abs(p.z + 4.45) < .65
    || room === 'patio' && p.x < 8.2 && Math.abs(p.z + 2.5) < .65)) {
    const target: FactoryRoom = room === 'factory' ? 'patio' : 'factory';
    return { kind: 'door' as const, room: target,
      position: { ...p, x: target === 'patio' ? 8.15 : 7.6, z: p.z + (target === 'patio' ? 1.95 : -1.95) } };
  }
}
