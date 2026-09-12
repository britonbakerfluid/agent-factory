/** Read the existing player without moving its iframe or interrupting playback. */
export function minimizedPlayerBounds(): DOMRect | undefined {
  const player = document.querySelector<HTMLElement>('.dj-station-screen.dj-station-minimized:not([hidden])');
  if (!player?.querySelector('.radio-minimized:not([hidden])')) return;
  const bounds = player.getBoundingClientRect();
  return bounds.width && bounds.height ? bounds : undefined;
}
