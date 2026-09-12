/** Briton's opening shot is authorized for the Fluid deployment only.
 * Explicit configuration also supports other hosts; an empty override disables it.
 * Render supplies RENDER_EXTERNAL_HOSTNAME (https://render.com/docs/environment-variables).
 */
export function welcomeChallengeOwner(env: Record<string, string | undefined>): string | undefined {
  if (env.AF_WELCOME_HORSE_OWNER_ID !== undefined) return env.AF_WELCOME_HORSE_OWNER_ID.trim() || undefined;
  return env.RENDER_EXTERNAL_HOSTNAME === 'fluid-factory.onrender.com'
    ? 'FGApEbY5j36CGIdrEvuUZ1DoBn03cPKgnQmWvRnHqnQ' : undefined;
}
