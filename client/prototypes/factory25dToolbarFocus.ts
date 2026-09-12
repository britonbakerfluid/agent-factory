/** Keep the shared dock in the active modal's top layer and sequence view changes. */
export function createToolbarFocus(toolbar: HTMLElement, available: () => boolean,
  leaveAvatar: () => boolean) {
  const views = [
    { className: 'newspaper-open', name: 'newspaper', close: '.newspaper-close', modal: '.newspaper-dialog' },
    { className: 'duck-hunt-open', name: 'duck hunt', close: '#duck-play', modal: '' },
    { className: 'dj-station-open', name: 'DJ station', close: '.lounge-radio-panel header button', modal: '' },
    { className: 'basketball-mode', name: 'basketball', close: '.visitor-ball-hint [data-action="back"]', modal: '' },
    { className: 'avatar-editor-open', name: 'avatar', close: '.avatar-close', modal: '.avatar-editor' },
    { className: 'brand-open', name: 'brand shelf', close: '.brand-library-dock button', modal: '.brand-library' },
    { className: 'team-open', name: 'our people', close: '.team-desk-dock button', modal: '.team-desk-dialog' },
    { className: 'chat-open', name: 'chat', close: '.lounge-chat-dock button', modal: '.lounge-chat-view' },
    { className: 'weather-open', name: 'window', close: '#window-back', modal: '' },
    { className: 'board-open', name: 'whiteboard', close: '#board-close', modal: '' },
    { className: 'inspect-open', name: 'close-up', close: '#inspect-back', modal: '' },
  ].map(view => ({ ...view, button: document.querySelector<HTMLButtonElement>(view.close),
    dialog: view.modal ? document.querySelector<HTMLElement>(view.modal) : null }));
  let pending: (() => void) | undefined;
  function focused() { return views.find(view => document.body.classList.contains(view.className)); }
  function back() {
    const view = focused();
    if (!view) return available();
    if (view.name === 'avatar') return leaveAvatar();
    const button=view.button??document.querySelector<HTMLButtonElement>(view.close);
    if (!button || button.disabled) return false;
    button.click(); return true;
  }
  return {
    name: () => { const view = focused(); return view?.dialog?.dataset.exiting === 'true' ? undefined : view?.name; },
    back,
    run(action: () => void) {
      if (available()) { pending = undefined; action(); return; }
      if (pending || back()) pending = action;
    },
    update() {
      const view = focused();
      // A modal makes all other DOM inert. Reparent the actual dock, not a visual
      // duplicate, so keyboard and pointer actions remain available in the editor.
      const layer = view?.dialog;
      const host = layer && (!(layer instanceof HTMLDialogElement) || layer.open) ? layer : document.body;
      if (toolbar.parentElement !== host) host.append(toolbar);
      const name = view?.dialog?.dataset.exiting === 'true' ? '' : view?.name ?? '';
      if (toolbar.dataset.focus !== name) toolbar.dataset.focus = name;
      if (pending && available()) { const action = pending; pending = undefined; action(); }
    },
    dispose() { pending = undefined; if (toolbar.parentElement !== document.body) document.body.append(toolbar); },
  };
}
