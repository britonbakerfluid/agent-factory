import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSoccerInteraction } from '../client/prototypes/factory25dSoccer';

afterEach(() => vi.unstubAllGlobals());

it('keeps the accessible hit target on the airborne model and restores shared shadow resources on disposal', () => {
  class Button extends EventTarget {
    type = ''; className = ''; title = ''; hidden = false;
    style: Record<string, string> = {}; dataset: Record<string, string> = {};
    attributes = new Map<string, string>(); removed = false;
    capture?: number;
    setPointerCapture(id: number) { this.capture = id; }
    hasPointerCapture(id: number) { return this.capture === id; }
    releasePointerCapture() { this.capture = undefined; }
    focus() {}
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    remove() { this.removed = true; }
  }
  const button = new Button(); let modal = false;
  vi.stubGlobal('document', { hidden: false, createElement: () => button, body: { matches: () => modal } });
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const canvas = { getBoundingClientRect: () => rect,
    parentElement: { append: vi.fn(), getBoundingClientRect: () => ({ left: 80, top: 30 }) } };
  const room = new THREE.Group(); room.position.set(0, 0, 1.95);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.14), new THREE.MeshBasicMaterial());
  ball.position.set(0, .158, 1); room.add(ball);
  const material = new THREE.MeshBasicMaterial({ opacity: .27, transparent: true });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), material); room.add(shadow);
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100);
  camera.position.set(0, 4, 12); camera.lookAt(0, 1, 0);
  const interaction = createSoccerInteraction(ball, shadow, canvas as unknown as HTMLCanvasElement);
  const cloneDisposed = vi.spyOn(shadow.material, 'dispose');
  const originalDisposed = vi.spyOn(material, 'dispose');
  interaction.update(0, false, camera, true);
  const startTop = parseFloat(button.style.top);
  expect(button.hidden).toBe(false);
  expect(button.attributes.get('aria-label')).toBe('Soccer ball');
  expect(parseFloat(button.style.width)).toBeGreaterThanOrEqual(44);
  button.dispatchEvent(new Event('click'));
  interaction.update(.2, false, camera, true);
  expect(ball.position.y).toBeGreaterThan(.158);
  expect(parseFloat(button.style.top)).toBeLessThan(startTop);
  expect(button.dataset.airborne).toBe('true');
  expect((shadow.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(material.opacity);
  expect(material.opacity).toBe(.27);
  const projected = ball.getWorldPosition(new THREE.Vector3()).project(camera);
  expect(parseFloat(button.style.top) + parseFloat(button.style.height) / 2)
    .toBeCloseTo(20 + (1 - projected.y) * 300, 8);
  button.dispatchEvent(new Event('click'));
  expect(button.dataset.touches).toBe('2');
  modal = true; interaction.update(.3, false, camera, true);
  expect(button.hidden).toBe(true); expect(ball.position.y).toBe(.158);
  modal = false; interaction.update(.4, false, camera, true);
  expect(ball.position.y).toBe(.158);
  const pointer = (type: string, x: number, time: number) => {
    const event = new Event(type, {cancelable: true});
    Object.defineProperties(event, {pointerId: {value: 1}, button: {value: 0}, clientX: {value: x}, clientY: {value: parseFloat(button.style.top) + 30 + 22}, timeStamp: {value: time}});
    button.dispatchEvent(event);
  };
  const startX = parseFloat(button.style.left) + 80 + 22;
  pointer('pointerdown', startX, 0); pointer('pointermove', startX + 10, 20); pointer('pointermove', startX + 50, 80);
  interaction.update(.45, false, camera, true);
  expect(button.dataset.dragging).toBe('true'); expect(ball.position.x).toBeGreaterThan(0);
  pointer('pointerup', startX + 50, 90);
  const releasedX = ball.position.x; interaction.update(.55, false, camera, true);
  expect(button.capture).toBeUndefined(); expect(button.dataset.dragging).toBeUndefined();
  expect(button.dataset.moving).toBe('true'); expect(ball.position.x).toBeGreaterThan(releasedX);
  expect(shadow.position.x).toBeCloseTo(ball.position.x);
  const nextX = parseFloat(button.style.left) + 80 + 22;
  pointer('pointerdown', nextX, 200); pointer('pointermove', nextX + 12, 230);
  pointer('pointercancel', nextX + 12, 250);
  expect(button.capture).toBeUndefined(); expect(button.dataset.dragging).toBeUndefined();
  interaction.update(.65, false, camera, true); expect(button.dataset.moving).toBe('false');
  interaction.dispose();
  expect(button.removed).toBe(true); expect(shadow.material).toBe(material);
  expect(cloneDisposed).toHaveBeenCalledOnce(); expect(originalDisposed).not.toHaveBeenCalled();
  ball.geometry.dispose(); ball.material.dispose(); shadow.geometry.dispose(); material.dispose();
});
