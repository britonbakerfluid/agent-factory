import type { GarageDriveInput } from '@shared/factory25d-driving';
import type { GarageCarId } from '@shared/factory25d-garage';
import './factory25dDriving.css';

const names = { mini: 'mini cooper', porsche: 'porsche', delorean: 'delorean', f1: 'f1' };
const keys: Record<string, string> = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift' };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');

/** One input path for keyboard, simultaneous touches and accessible button taps. */
export function createDrivingControls(actions: { input(value: GarageDriveInput): void; leave(): void; reset(): void }) {
  const abort = new AbortController(), options = { signal: abort.signal };
  const held = new Map<string, string>(), taps = new Map<string, ReturnType<typeof setTimeout>>();
  let car: GarageCarId | undefined, enabled = false, previous = '', restoreFocus: HTMLElement | null = null;
  const dock = document.createElement('section'); dock.className = 'garage-driving-dock pixel-island'; dock.hidden = true; dock.setAttribute('aria-label', 'Car controls');
  dock.innerHTML = `<div class="garage-driving-title"><strong></strong><span class="garage-driving-condition"></span></div>
    <p class="garage-driving-help">WASD / arrows to drive · space to drift · esc to park</p>
    <div class="garage-driving-touch" aria-label="Driving controls">
      <button type="button" data-drive="left" aria-label="Steer left">←</button><button type="button" data-drive="right" aria-label="Steer right">→</button>
      <button type="button" data-drive="down" aria-label="Brake or reverse">↓</button><button type="button" data-drive="up" aria-label="Accelerate">↑</button>
      <button type="button" data-drive="drift" aria-label="Handbrake drift">drift</button>
    </div><div class="garage-driving-actions"><button type="button" data-action="reset">recover car</button><button type="button" data-action="leave">park + get out</button></div>`;
  const notice = document.createElement('p'); notice.className = 'garage-driving-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = true;
  const noticeText = document.createElement('span');
  const parkingRecovery = document.createElement('button'); parkingRecovery.type = 'button'; parkingRecovery.textContent = 'recover parking car'; parkingRecovery.hidden = true;
  parkingRecovery.addEventListener('click', () => actions.reset(), options); notice.append(noticeText, parkingRecovery);
  document.body.append(dock, notice);
  function send(force = false) {
    const down = (direction: string) => enabled && [...held.values()].includes(direction);
    const input = { throttle: Number(down('up')) - Number(down('down')), steer: Number(down('right')) - Number(down('left')), drift: down('drift') };
    const signature = JSON.stringify(input);
    if (force || signature !== previous) { previous = signature; actions.input(input); }
  }
  function stop() { held.clear(); for (const timer of taps.values()) clearTimeout(timer); taps.clear(); send(true); }
  const leave = () => { stop(); actions.leave(); };
  document.addEventListener('keydown', event => {
    if (!car || !enabled || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); leave(); return; }
    const direction = keys[event.code]; if (!direction) return;
    if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button,summary')) return;
    event.preventDefault(); event.stopImmediatePropagation(); held.set(event.code, direction); send();
  }, { ...options, capture: true });
  document.addEventListener('keyup', event => {
    if (!held.has(event.code)) return;
    held.delete(event.code); send(); event.preventDefault();
  }, { ...options, capture: true });
  for (const button of dock.querySelectorAll<HTMLButtonElement>('[data-drive]')) {
    const direction = button.dataset.drive!;
    button.addEventListener('pointerdown', event => {
      if (!enabled) return; event.preventDefault(); button.setPointerCapture(event.pointerId);
      held.set(`pointer-${event.pointerId}`, direction); send();
    }, options);
    const release = (event: PointerEvent) => { held.delete(`pointer-${event.pointerId}`); send(); };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(event, release, options);
    // Keyboard/screen-reader activation has no held pointer. One short pulse
    // spans the authoritative server tick and never leaves acceleration stuck.
    button.addEventListener('click', event => {
      if (!enabled || event.detail !== 0) return;
      const key = `tap-${direction}`; clearTimeout(taps.get(key)); held.set(key, direction); send();
      taps.set(key, setTimeout(() => { held.delete(key); taps.delete(key); send(); }, 180));
    }, options);
  }
  dock.querySelector('[data-action="leave"]')!.addEventListener('click', leave, options);
  dock.querySelector('[data-action="reset"]')!.addEventListener('click', () => { stop(); actions.reset(); }, options);
  window.addEventListener('blur', stop, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
  return {
    dock,
    show(next: GarageCarId | undefined) {
      if (next === car) return;
      const entering = !car && !!next; car = next; enabled = !!next; dock.hidden = !next;
      document.body.classList.toggle('garage-driving', !!next); stop();
      if (entering) { restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; document.body.tabIndex = -1; document.body.focus({ preventScroll: true }); }
      else if (!next && restoreFocus?.isConnected && restoreFocus.getClientRects().length) restoreFocus.focus({ preventScroll: true });
      if (next) dock.querySelector('strong')!.textContent = names[next];
    },
    enable(next: boolean) { if (enabled === next) return; enabled = next; if (!next) stop(); },
    condition(damage: number, slipping: boolean, hoverHeight = 0) {
      const text = car === 'delorean' ? hoverHeight < 1.4 ? 'lifting off' : 'hovering' : slipping ? 'drifting' : damage > .45 ? 'needs a little repair' : damage > .08 ? 'a few scuffs' : 'ready to roll';
      const label = dock.querySelector('.garage-driving-condition')!;
      if (label.textContent !== text) label.textContent = text;
    },
    announce(message: string) { noticeText.textContent = message; notice.hidden = !message; },
    parking(active: boolean) { parkingRecovery.hidden = !active; },
    visible(show: boolean) { notice.hidden = !show || !noticeText.textContent; dock.hidden = !show || !car; },
    stop,
    dispose() { stop(); abort.abort(); dock.remove(); notice.remove(); document.body.classList.remove('garage-driving'); },
  };
}
