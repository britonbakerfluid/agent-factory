import * as THREE from 'three';

/** Pointer capture keeps a record held even when a fast stroke leaves its rim. */
export function createRecordScratch(records: THREE.Object3D[], canvas: HTMLCanvasElement, send: (deck: number, offset: number) => void) {
  const abort = new AbortController(), options = {signal: abort.signal};
  let drag: {deck: number; pointer: number; y: number; sentAt: number} | undefined;
  const point = new THREE.Vector3(), edge = new THREE.Vector3();
  const buttons = records.map((_, deck) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'dj-record-target';
    button.setAttribute('aria-label', `Scratch ${deck === 0 ? 'left' : 'right'} record`);
    button.title = 'Drag back and forth to scratch the shared music'; button.hidden = true; document.body.append(button);
    button.addEventListener('pointerdown', event => {
      if (drag) return;
      event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
      drag = {deck, pointer: event.pointerId, y: event.clientY, sentAt: -Infinity};
    }, options);
    button.addEventListener('pointermove', event => {
      if (!drag || drag.deck !== deck || drag.pointer !== event.pointerId) return;
      const now = performance.now(); if (now - drag.sentAt < 125) return;
      const offset = Math.max(-.8, Math.min(.8, (drag.y - event.clientY) * .015));
      if (Math.abs(offset) < .03) return;
      drag.y = event.clientY; drag.sentAt = now; send(deck, offset);
    }, options);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => release(), options);
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault(); event.stopPropagation(); if (!event.repeat) send(deck, event.key === 'ArrowUp' ? .5 : -.5);
    }, options);
    return button;
  });
  function release() { if (drag) { const deck = drag.deck; drag = undefined; send(deck, 0); } }
  window.addEventListener('blur', release, options);
  return {
    update(camera: THREE.Camera, active: boolean) {
      if (!active) release();
      const rect = canvas.getBoundingClientRect();
      records.forEach((record, index) => {
        const button = buttons[index]; button.hidden = !active; if (!active) return;
        record.getWorldPosition(point); edge.copy(point); edge.x += .185;
        point.project(camera); edge.project(camera);
        button.style.left = `${rect.left + (point.x + 1) * rect.width / 2}px`;
        button.style.top = `${rect.top + (1 - point.y) * rect.height / 2}px`;
        button.style.width = button.style.height = `${Math.max(44, Math.abs(edge.x - point.x) * rect.width)}px`;
      });
    },
    dispose() { release(); abort.abort(); buttons.forEach(button => button.remove()); },
  };
}
