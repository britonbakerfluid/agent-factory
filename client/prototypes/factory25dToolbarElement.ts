/** Shared markup for the live dock and the lightweight state gallery. */
export function createToolbarElement() {
  const toolbar = document.createElement('div'); toolbar.className = 'factory-toolbar pixel-island';
  const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${path}</svg>`;
  const personIcon = icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>');
  const agentsIcon = icon('<path d="M6 7h12v2h2v9h-2v2H6v-2H4V9h2ZM12 3v4M8 12v2m8-2v2m-7 3h6"/>');
  const contextIcons = {
    reconnect: `<svg class="factory-pixel-spinner" viewBox="0 0 24 24" aria-hidden="true">${[[10,2],[16,4],[18,10],[16,16],[10,18],[4,16],[2,10],[4,4]].map(([x,y],i)=>`<rect x="${x}" y="${y}" width="4" height="4" fill="currentColor" style="--spinner-step:${i}"/>`).join('')}</svg>`,
    back: icon('<path d="M10 5H8v3H5v3H3v2h2v3h3v3h2M4 12h17"/>'),
    find: icon('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>'),
    connect: icon('<path d="M14 4h5v16h-5M3 12h12m-4-4 4 4-4 4"/>'),
    stop: icon('<rect x="5" y="5" width="14" height="14" rx="3"/>'),
    help: icon('<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>'),
  };
  toolbar.innerHTML = `<nav class="factory-toolbar-actions" aria-label="Factory controls"><button type="button" class="factory-room-picker" data-tooltip="choose a room"><span class="factory-nav-icon" aria-hidden="true">${icon('<path d="M3 11h3V8h3V5h6v3h3v3h3v10H3ZM9 21v-8h6v8"/>')}</span><span class="factory-room-label">workspace</span><span class="factory-room-chevron" aria-hidden="true">${icon('<path d="m6 9 6 6 6-6"/>')}</span></button><div class="factory-view-tools"></div><span class="factory-focus-title" hidden></span><button type="button" class="factory-agents-shortcut" data-tooltip="agents &amp; activity" aria-controls="factory-agent-controls" aria-expanded="false"><span class="factory-nav-icon">${agentsIcon}</span><span class="factory-nav-label">your agents</span><span class="factory-toolbar-count" hidden></span></button><span class="factory-control-identity" role="status" aria-live="polite" hidden><span class="factory-control-caption"></span><strong class="factory-control-name"></strong></span><button type="button" class="factory-context-action"><span class="factory-nav-icon">${contextIcons.connect}</span><span class="factory-nav-label">connect</span><span class="factory-reconnect-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></button><button type="button" class="factory-avatar-shortcut" aria-label="Edit my avatar" aria-haspopup="dialog"><span class="factory-nav-portrait">${personIcon}</span><span class="factory-avatar-connection" aria-hidden="true">${contextIcons.reconnect}</span></button></nav>`;
  return {toolbar,contextIcons,personIcon};
}
