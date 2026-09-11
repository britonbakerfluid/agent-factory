/** Muted faders display zero; their last nonzero level survives reloads. */
export function savedVolume(key: string, current: number, storage?: Pick<Storage, 'getItem'>): number {
  try {
    const value = storage?.getItem(`${key}:last-audible`);
    if (value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0) return Math.min(100, Number(value));
  } catch { /* Private browsing still supports the in-memory level. */ }
  return current > 0 ? current : 40;
}
export function rememberVolume(key: string, value: number, storage?: Pick<Storage, 'setItem'>) {
  if (!Number.isFinite(value) || value <= 0) return;
  try { storage?.setItem(`${key}:last-audible`, String(Math.min(100, value))); } catch { /* Optional persistence. */ }
}
