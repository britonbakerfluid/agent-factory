import { pixelIcon } from './factory25dPixelIcons';
/** Shared markup for the live dock and the lightweight state gallery. */
export function createToolbarElement() {
  const toolbar = document.createElement('div'); toolbar.className = 'factory-toolbar pixel-island';
  const personIcon = pixelIcon('user');
  const contextIcons = {
    reconnect: `<svg class="factory-pixel-spinner" viewBox="0 0 24 24" aria-hidden="true">${[[10,2],[16,4],[18,10],[16,16],[10,18],[4,16],[2,10],[4,4]].map(([x,y],i)=>`<rect x="${x}" y="${y}" width="4" height="4" fill="currentColor" style="--spinner-step:${i}"/>`).join('')}</svg>`,
    back: pixelIcon('arrow-left'),
    find: pixelIcon('target'),
    connect: pixelIcon('login'),
    stop: pixelIcon('stop'),
    help: pixelIcon('circle-question'),
  };
  toolbar.innerHTML = `<nav class="factory-toolbar-actions" aria-label="Factory controls"><button type="button" class="factory-room-picker" data-tooltip="choose a room"><span class="factory-nav-icon" aria-hidden="true">${pixelIcon('building')}</span><span class="factory-room-label">workspace</span><span class="factory-room-chevron" aria-hidden="true">${pixelIcon('chevrons-vertical')}</span></button><div class="factory-view-tools"></div><span class="factory-focus-title" hidden></span><span class="factory-control-identity" role="status" aria-live="polite" hidden><span class="factory-control-caption"></span><strong class="factory-control-name"></strong></span><button type="button" class="factory-context-action"><span class="factory-nav-icon">${contextIcons.connect}</span><span class="factory-nav-label">connect</span><span class="factory-reconnect-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></button><button type="button" class="factory-avatar-shortcut" aria-label="Edit my avatar" aria-haspopup="dialog"><span class="factory-nav-portrait">${personIcon}</span><span class="factory-avatar-connection" aria-hidden="true">${contextIcons.reconnect}</span></button></nav>`;
  return {toolbar,contextIcons,personIcon};
}
