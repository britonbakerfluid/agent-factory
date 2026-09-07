import * as THREE from 'three';
import './factory25dLightSwitches.css';

export interface SceneLightSwitch {
  id: string;
  label: string;
  kind: 'lamp' | 'candle' | 'light';
  target: THREE.Object3D;
  hitTargets?: THREE.Object3D[];
  isOn: () => boolean;
  setOn: (on: boolean) => void;
}
export interface RoomLightSwitch extends SceneLightSwitch { room: 'factory' | 'garage' | 'patio' }
const STORAGE_KEY = 'factory-light-switches-v1';

export function readLightPreferences(storage: Pick<Storage, 'getItem'>): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, on]) => key.length < 100 && typeof on === 'boolean'));
  } catch { return {}; }
}

/** Screen-space targets follow the actual props. Close neighbors (especially the
 * phone and candle) resolve to the nearest center instead of stealing each other's taps. */
export function createLightInteractions(canvas: HTMLCanvasElement, switches: RoomLightSwitch[],
  options: { camera: () => THREE.Camera; visible: (room: RoomLightSwitch['room']) => boolean;
    sound: (kind: SceneLightSwitch['kind'], on: boolean) => void }) {
  const host = canvas.parentElement!, abort = new AbortController();
  let saved: Record<string, boolean> = {};
  try { saved = readLightPreferences(localStorage); } catch { /* Storage can be disabled. */ }
  const point = new THREE.Vector3(), box = new THREE.Box3(), ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: { x: number; y: number } | undefined;
  const entries = switches.map(light => {
    if (typeof saved[light.id] === 'boolean') light.setOn(saved[light.id]);
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'scene-light-switch'; button.dataset.lightId = light.id; button.hidden = true;
    button.setAttribute('aria-label', light.label);
    host.append(button);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); if (options.visible(light.room)) toggle(light);
    }, { signal: abort.signal });
    light.target.updateWorldMatrix(true, true); box.setFromObject(light.target);
    const center = box.isEmpty() ? new THREE.Vector3() : light.target.worldToLocal(box.getCenter(new THREE.Vector3()));
    return { light, button, center, x: 0, y: 0, lastOn: undefined as boolean | undefined };
  });
  function toggle(light: SceneLightSwitch) {
    const on = !light.isOn(); light.setOn(on); saved[light.id] = on;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Keep the current scene usable. */ }
    options.sound(light.kind, on); updateLabels();
  }
  function updateLabels() {
    for (const entry of entries) {
      const { light, button } = entry, on = light.isOn(); if (entry.lastOn === on) continue; entry.lastOn = on;
      button.setAttribute('aria-pressed', String(on));
      button.title = `${on ? 'turn off' : 'turn on'} ${light.label.toLowerCase()}`;
      button.dataset.on = String(on);
    }
  }
  // Capture before underlying room/phone handlers. Keyboard and accessibility
  // activation go directly to their chosen button without spatial reassignment.
  host.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; }, { capture: true, signal: abort.signal });
  host.addEventListener('click', event => {
    if (event.detail === 0 || !(event.target instanceof Element)) return;
    if (event.target.closest('.factory-controls, .factory-preview-tools, .agent-label, .scene-sound, [role="dialog"], #inspect-navigation')) return;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
      if (event.target.closest('.scene-light-switch')) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    const active = entries.filter(entry => !entry.button.hidden);
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, options.camera());
    const roots = active.flatMap(({ light }) => light.hitTargets ?? [light.target]);
    const direct = ray.intersectObjects(roots, true)[0];
    if (direct) {
      const entry = active.find(({ light }) => (light.hitTargets ?? [light.target]).some(root => {
        let node: THREE.Object3D | null = direct.object;
        while (node) { if (node === root) return true; node = node.parent; }
        return false;
      }));
      if (entry) { event.preventDefault(); event.stopImmediatePropagation(); toggle(entry.light); return; }
    }
    const hit = active
      .map(entry => ({ entry, distance: Math.hypot(entry.x - event.clientX, entry.y - event.clientY) }))
      .filter(hit => hit.distance <= 22).sort((a, b) => a.distance - b.distance)[0];
    if (!hit) return;
    let closest: HTMLButtonElement | undefined, nearest = hit.distance;
    for (const peer of host.querySelectorAll<HTMLButtonElement>('button:not(.scene-light-switch)')) {
      if (peer.hidden || peer.disabled || !peer.getClientRects().length) continue;
      const rect = peer.getBoundingClientRect();
      if (rect.width > 200 || rect.height > 200 || event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) continue;
      const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY);
      if (distance < nearest) { closest = peer; nearest = distance; }
    }
    if (closest && !event.target.closest('.scene-light-switch')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (closest) closest.click(); else toggle(hit.entry.light);
  }, { capture: true, signal: abort.signal });
  updateLabels();
  return {
    update() {
      const camera = options.camera(), rect = canvas.getBoundingClientRect(), parent = host.getBoundingClientRect();
      camera.updateMatrixWorld();
      for (const entry of entries) {
        const { light, button } = entry;
        button.hidden = document.hidden || !options.visible(light.room);
        if (button.hidden) continue;
        light.target.updateWorldMatrix(true, true);
        point.copy(entry.center); light.target.localToWorld(point);
        point.project(camera);
        button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        if (button.hidden) continue;
        entry.x = rect.left + (point.x + 1) * rect.width / 2;
        entry.y = rect.top + (1 - point.y) * rect.height / 2;
        button.style.left = `${entry.x - parent.left - 22}px`;
        button.style.top = `${entry.y - parent.top - 22}px`;
      }
      updateLabels();
    },
    dispose() { abort.abort(); for (const { button } of entries) button.remove(); },
  };
}
