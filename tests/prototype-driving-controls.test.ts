import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDrivingControls } from '../client/prototypes/factory25dDrivingControls';

class Element extends EventTarget {
  dataset: Record<string,string> = {}; hidden = false; className = ''; textContent = ''; tabIndex = 0; isConnected = true;
  children: Element[] = []; captured = new Set<number>(); classes = new Set<string>();
  classList = { toggle: (key: string, on: boolean) => on ? this.classes.add(key) : this.classes.delete(key), remove: (key: string) => this.classes.delete(key) };
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute() {} focus() {} closest() { return null; } getClientRects() { return [1]; } remove() { this.isConnected = false; }
  setPointerCapture(id: number) { this.captured.add(id); } hasPointerCapture(id: number) { return this.captured.has(id); } releasePointerCapture(id: number) { this.captured.delete(id); }
}
function setup() {
  const body = new Element(), canvas = new Element();
  const doc = Object.assign(new EventTarget(), { body, hidden: false, activeElement: body, createElement: () => new Element() });
  const win = new EventTarget();
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('HTMLElement', Element);
  const actions = { input: vi.fn(), leave: vi.fn() };
  const controls = createDrivingControls(canvas as unknown as HTMLCanvasElement, actions); controls.show('mini'); controls.enable(true);
  function event(type: string, fields: Record<string,unknown> = {}) {
    const e = new Event(type, { cancelable: true });
    Object.defineProperty(e, 'target', { value: canvas }); Object.assign(e, fields); doc.dispatchEvent(e); return e;
  }
  return { controls, actions, canvas, doc, win, event };
}
afterEach(() => vi.unstubAllGlobals());

describe('direct car input without a driving panel', () => {
  it('drives with keyboard, clears input on blur, and parks with Escape', () => {
    const f = setup();
    f.event('keydown', { code: 'KeyW' }); f.event('keydown', { code: 'KeyD' });
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 1, steer: 1, drift: false });
    f.win.dispatchEvent(new Event('blur'));
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 0, steer: 0, drift: false });
    const escape = f.event('keydown', { code: 'Escape' }); expect(escape.defaultPrevented).toBe(true); expect(f.actions.leave).toHaveBeenCalledOnce();
    f.controls.dispose();
  });
  it('uses touch drag and a second finger for drift, and prevents a drag from clicking a car on release', () => {
    const f = setup();
    f.event('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 120, clientY: 300 });
    f.event('pointermove', { pointerId: 1, clientX: 192, clientY: 228 });
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 1, steer: 1, drift: false });
    f.event('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 80, clientY: 300 });
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 1, steer: 1, drift: true });
    f.event('pointerup', { pointerId: 1 });
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 0, steer: 0, drift: false }); expect(f.canvas.captured.size).toBe(0);
    expect(f.event('click', { detail: 1 }).defaultPrevented).toBe(true);
    expect(f.event('click', { detail: 0 }).defaultPrevented).toBe(false); // keyboard activation remains available
    f.controls.dispose();
  });
  it('keeps a tap available for switching/parking and stops held input when hidden or disabled', () => {
    const f = setup();
    f.event('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 120, clientY: 300 });
    f.event('pointerup', { pointerId: 1 }); expect(f.event('click', { detail: 1 }).defaultPrevented).toBe(false);
    f.event('keydown', { code: 'KeyW' }); f.doc.hidden = true; f.doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 0, steer: 0, drift: false });
    f.controls.enable(false); f.event('keydown', { code: 'KeyW' });
    expect(f.actions.input).toHaveBeenLastCalledWith({ throttle: 0, steer: 0, drift: false });
    f.controls.dispose();
  });
});

it('requires two distinct taps and clears the boost request after five seconds', () => {
  let now = 1000; vi.stubGlobal('performance', { now: () => now });
  const f = setup();
  f.event('keydown', { code: 'Space', repeat: false });
  expect(f.actions.input.mock.lastCall?.[0].celebrate).toBeUndefined();
  now += 100; f.event('keydown', { code: 'Space', repeat: true });
  expect(f.actions.input.mock.lastCall?.[0].celebrate).toBeUndefined();
  f.event('keyup', { code: 'Space' }); now += 100;
  f.event('keydown', { code: 'Space', repeat: false });
  f.event('keydown', { code: 'ArrowRight' });
  expect(f.actions.input.mock.lastCall?.[0]).toMatchObject({ celebrate: true, steer: 1 });
  now += 5001; f.controls.tick();
  expect(f.actions.input.mock.lastCall?.[0].celebrate).toBeUndefined();
  f.controls.dispose();
});
