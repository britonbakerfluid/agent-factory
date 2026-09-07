import type { TeamMember } from '@shared/team';

/** Keep the current outing stable across presence polls. A new day's visit can
 * feature different people from the same saved roster, including offline people. */
export function mountainVisitors(members: readonly TeamMember[], currentIds: readonly string[] = [],
  day = Math.floor(Date.now() / 86_400_000)): TeamMember[] {
  const byId = new Map(members.map(member => [member.id, member]));
  const pool = [...byId.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!pool.length) return [];
  const start = ((day % pool.length) + pool.length) % pool.length;
  const ordered = [...currentIds, ...pool.slice(start).map(member => member.id), ...pool.slice(0, start).map(member => member.id)];
  return [...new Set(ordered)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []).slice(0, 2);
}

/** Share the saved cast between outings without showing one person twice in
 * the landscape. With a small roster, leave a seat for the lake visitor. */
export function landscapeVisitors(members: readonly TeamMember[], current: { climbers: readonly string[]; canoe: readonly string[] },
  day = Math.floor(Date.now() / 86_400_000)) {
  const count = new Set(members.map(member => member.id)).size;
  const climbers = mountainVisitors(members, current.climbers, day).slice(0, Math.min(2, Math.max(0, count - 1)));
  const climbingIds = new Set(climbers.map(member => member.id));
  const canoe = mountainVisitors(members.filter(member => !climbingIds.has(member.id)), current.canoe, day + 2);
  return { climbers, canoe };
}
