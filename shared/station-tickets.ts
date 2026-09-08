import type { StationTicketPayout, StationTicketState, WorldAgent } from './types.js';
export const TICKET_ACTIVE_MS = 60_000;
export const TICKET_COLLECT_MS = 2_400;
export function ticketOwnerKey(agent: Pick<WorldAgent, 'ownerId' | 'username'>) {
  return agent.ownerId ? `owner:${agent.ownerId}` : `user:${agent.username.toLowerCase()}`;
}
export function ticketBalance(state: StationTicketState | undefined, owner: Pick<WorldAgent, 'ownerId' | 'username'>) {
  return state?.wallets.find(wallet => wallet.key === ticketOwnerKey(owner))?.balance ?? 0;
}
export function ticketPayoutProgress(payout: StationTicketPayout | undefined, now: number) {
  if (!payout || now < payout.startedAt || now >= payout.collectAt) return;
  return Math.max(0, Math.min(1, (now - payout.startedAt) / Math.max(1, payout.collectAt - payout.startedAt)));
}
