import type { WorldSnapshot } from '@shared/types';

export const AGENT_ARRIVAL_MS = 940;
const FALL_MS = 560;
export interface AgentArrivalPose {
  lift: number; angle: number; shadowScale: number; shadowOpacity: number; impact?: number;
}

/** A rigid fall, one low rebound, and a short grounded landing. No body scaling. */
export function agentArrivalPose(age: number): AgentArrivalPose {
  const time = Math.max(0, Math.min(AGENT_ARRIVAL_MS, age));
  const falling = time < FALL_MS, fall = time / FALL_MS;
  const landed = Math.max(0, (time - FALL_MS) / (AGENT_ARRIVAL_MS - FALL_MS));
  const hop = Math.min(1, (time - FALL_MS) / 210);
  const lift = falling ? 1.8 * (1 - fall * fall) : hop < 1 ? Math.sin(Math.PI * hop) * .07 : 0;
  return { lift, angle: falling ? -.065 * Math.sin(Math.PI * fall) : hop < 1 ? .025 * Math.sin(Math.PI * hop) * (1 - hop) : 0,
    shadowScale: 1 + lift * .24, shadowOpacity: 1 / (1 + lift * 1.6),
    ...(falling ? {} : { impact: landed }) };
}

/** Remember identities across reconnects: roster hydration is never an entrance. */
export class NewAgentArrivals {
  readonly active = new Map<string, number>();
  private seen = new Set<string>();
  private needsBaseline = true;
  private revision = -1;

  baseline(snapshot?: WorldSnapshot) {
    this.active.clear(); this.needsBaseline = !snapshot;
    if (snapshot) { this.remember(snapshot); this.revision = snapshot.revision; }
  }

  private remember(snapshot: WorldSnapshot) {
    for (const agent of snapshot.agents) this.seen.add(agent.sessionId);
    for (const stone of snapshot.tombstones) this.seen.add(stone.sessionId);
  }

  sync(snapshot: WorldSnapshot) {
    if (this.needsBaseline || snapshot.revision < this.revision) { this.baseline(snapshot); return; }
    const present = new Set(snapshot.agents.map(agent => agent.sessionId));
    for (const id of this.active.keys()) if (!present.has(id)) this.active.delete(id);
    for (const agent of snapshot.agents) {
      const age = snapshot.serverTime - agent.startedAt;
      if (!this.seen.has(agent.sessionId) && age >= -100 && age < 2500 && !agent.manualControl
        && agent.activity !== 'stopped' && !agent.world.carVisit && !agent.ticketPayout) {
        this.active.set(agent.sessionId, snapshot.serverTime);
      }
    }
    this.remember(snapshot); this.revision = snapshot.revision;
  }

  cancel(id: string) { this.active.delete(id); }
  sample(id: string, now: number, reduced: boolean) {
    const start = this.active.get(id);
    if (start === undefined) return;
    if (reduced || now - start >= AGENT_ARRIVAL_MS || now < start - 100) { this.cancel(id); return; }
    return agentArrivalPose(now - start);
  }
  clear() { this.active.clear(); this.seen.clear(); this.needsBaseline = true; this.revision = -1; }
}
