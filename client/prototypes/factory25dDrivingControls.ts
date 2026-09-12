import type { GarageDriveInput } from '@shared/factory25d-driving';
import type { GarageCarId } from '@shared/factory25d-garage';
import './factory25dDriving.css';

const keys: Record<string, string> = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift' };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
const axis = (distance: number) => Math.sign(distance) * Math.min(1, Math.max(0, Math.abs(distance) - 7) / 65);

/** Direct scene controls: no driving panel. A relative drag is the touch stick. */
export function createDrivingControls(canvas: HTMLCanvasElement, actions: { input(value: GarageDriveInput): void; leave(): void }) {
  const abort = new AbortController(), options = { signal: abort.signal };
  const held = new Map<string, string>(), fingers = new Set<number>();
  let drag: { id: number; x: number; y: number; steer: number; throttle: number } | undefined;
  let car: GarageCarId | undefined, enabled = false, previous = '', suppressClickUntil = 0, moved = false;
  let lastSpace = -Infinity, celebrationUntil = 0;
  let restoreFocus: HTMLElement | null = null;
  // Retain announcements for assistive technology and DOM diagnostics, with
  // no visible HUD, condition banner, buttons or recovery shortcut.
  const dock = document.createElement('section'); dock.className = 'garage-driving-access'; dock.setAttribute('aria-label', 'Car controls');
  const notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); dock.append(notice); document.body.append(dock);
  function send(force = false) {
    const down = (direction: string) => enabled && [...held.values()].includes(direction);
    const input: GarageDriveInput = {
      throttle: enabled && drag ? drag.throttle : Number(down('up')) - Number(down('down')),
      steer: enabled && drag ? drag.steer : Number(down('right')) - Number(down('left')),
      drift: down('drift') || enabled && fingers.size > 1,
      ...(enabled && performance.now() < celebrationUntil ? {celebrate:true} : {}),
    };
    const signature = JSON.stringify(input);
    if (force || signature !== previous) { previous = signature; actions.input(input); }
  }
  function stop() {
    held.clear(); drag = undefined; lastSpace = -Infinity; celebrationUntil = 0;
    const captured = [...fingers]; fingers.clear();
    for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    send(true);
  }
  document.addEventListener('keydown', event => {
    if (!car || !enabled || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stop(); actions.leave(); return; }
    const direction = keys[event.code]; if (!direction) return;
    if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button,summary')) return;
    if(event.code === 'Space' && !event.repeat) {
      const now = performance.now();
      if(now-lastSpace <= 320 && now >= celebrationUntil) { celebrationUntil=now+5000; lastSpace=-Infinity; notice.textContent='Rocket celebration · left and right to twist · five seconds'; }
      else lastSpace=now;
    }
    event.preventDefault(); event.stopImmediatePropagation(); held.set(event.code, direction); send();
  }, { ...options, capture: true });
  document.addEventListener('keyup', event => {
    if (!held.has(event.code)) return;
    held.delete(event.code); send(); event.preventDefault();
  }, { ...options, capture: true });
  document.addEventListener('pointerdown', event => {
    if (!enabled || !car || event.target !== canvas || event.pointerType === 'mouse') return;
    fingers.add(event.pointerId); canvas.setPointerCapture(event.pointerId);
    if (!drag) { drag = { id: event.pointerId, x: event.clientX, y: event.clientY, steer: 0, throttle: 0 }; moved = false; }
    else moved = true;
    event.stopImmediatePropagation(); send();
  }, { ...options, capture: true });
  document.addEventListener('pointermove', event => {
    if (!drag || !fingers.has(event.pointerId)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.pointerId !== drag.id) return;
    const x = event.clientX - drag.x, y = event.clientY - drag.y;
    moved ||= Math.hypot(x, y) > 7;
    drag.steer = axis(x); drag.throttle = axis(-y); send();
  }, { ...options, capture: true, passive: false });
  const release = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId)) return;
    if (moved) suppressClickUntil = performance.now() + 500;
    const primary = drag?.id === event.pointerId;
    fingers.delete(event.pointerId);
    if (primary) stop(); else send();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) document.addEventListener(event, release, { ...options, capture: true });
  // A drag ending over a car must not accidentally switch or park it.
  document.addEventListener('click', event => {
    if (event.target === canvas && event.detail !== 0 && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { ...options, capture: true });
  window.addEventListener('blur', stop, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
  return {
    dock,
    tick() { if (celebrationUntil && performance.now() >= celebrationUntil) { celebrationUntil = 0; send(true); } },
    show(next: GarageCarId | undefined) {
      if (next === car) return;
      const entering = !car && !!next; car = next; enabled = !!next;
      document.body.classList.toggle('garage-driving', !!next); dock.dataset.active = String(!!next); stop();
      if (entering) { restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; document.body.tabIndex = -1; document.body.focus({ preventScroll: true }); }
      else if (!next && restoreFocus?.isConnected && restoreFocus.getClientRects().length) restoreFocus.focus({ preventScroll: true });
    },
    enable(next: boolean) { if (enabled === next) return; enabled = next; if (!next) stop(); },
    condition(damage: number, slipping: boolean, hoverHeight = 0) { Object.assign(dock.dataset, { damage: damage.toFixed(3), slipping: String(slipping), hoverHeight: hoverHeight.toFixed(3) }); },
    announce(message: string) { notice.textContent = message; },
    visible(show: boolean) { dock.hidden = !show; },
    stop,
    dispose() { stop(); abort.abort(); dock.remove(); document.body.classList.remove('garage-driving'); },
  };
}
