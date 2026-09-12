import type { AvatarConfig } from '../shared/types.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import { AVATAR_COLORS, AVATAR_STYLES, parseAvatarConfig } from '../shared/avatar-customization.js';

/** Roster portraits are derived from legacy hooks; saved avatar profiles keep strict validation. */
export function normalizeTeamAvatar(value: unknown): AvatarConfig {
  const valid = parseAvatarConfig(value);
  if (valid) return valid;
  let avatar: AvatarConfig = { ...DEFAULT_AVATAR };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return avatar;
  const raw = value as Record<string, unknown>;
  for (const key of ['spriteIndex', 'hat', 'trail', 'graphicDeath', ...AVATAR_COLORS, ...Object.keys(AVATAR_STYLES)]) {
    let candidate = raw[key];
    if (candidate === undefined) continue;
    if ((AVATAR_COLORS as readonly string[]).includes(key) && typeof candidate === 'string' && /^#[0-9a-f]{3}$/i.test(candidate)) {
      candidate = '#' + candidate.slice(1).split('').map(char => char + char).join('');
    }
    const next = parseAvatarConfig({ ...avatar, [key]: candidate });
    if (next) avatar = next;
  }
  return avatar;
}
