import * as THREE from 'three';

export const MIST_FLAG = {
  x: 18.4, z: -4.35, width: 1.75, height: 1.75 * 576 / 1024,
  top: 3.08, poleHeight: 3.2, fps: 15, columns: 32, rows: 14,
} as const;

// Trim the original presentation canvas's empty margin, preserving its aspect
// ratio and the exact pixel geometry. Picking uses this same ink window.
export const MIST_INK_WINDOW = { x: 120, y: 102, width: 680, height: 382.5 } as const;

/** Integrate the cloth's tangent instead of stretching a flat rectangle.
 * Each horizontal strip retains its length while travelling folds shorten its
 * silhouette. The full hoist is pinned; the free bottom corner hangs lower. */
export function mistClothVertex(u: number, v: number, elapsed: number, wind01: number, reduced: boolean) {
  const wind = reduced ? .25 : THREE.MathUtils.clamp(Number.isFinite(wind01) ? wind01 : 0, 0, 1);
  const t = reduced ? 0 : Math.floor((Number.isFinite(elapsed) ? elapsed : 0) * MIST_FLAG.fps) / MIST_FLAG.fps;
  const phase = t * (1.5 + wind * .8);
  const segments = Math.max(1, Math.ceil(u * MIST_FLAG.columns));
  const length = u * MIST_FLAG.width / segments;
  let x = -MIST_FLAG.width / 2, z = 0;
  for (let i = 0; i < segments; i++) {
    const s = u * (i + .5) / segments;
    const bend = (1 - Math.exp(-s * 7)) * (.55 + wind * .32);
    const angle = bend * Math.sin(s * 8.4 - phase + (v - .5) * .8)
      + s * .13 * Math.sin(phase * .43);
    x += Math.cos(angle) * length; z += Math.sin(angle) * length;
  }
  const sag = Math.pow(u, 1.5) * (.055 + (1 - wind) * .075) * (1.2 - v * .45);
  return { x, y: (v - .5) * MIST_FLAG.height - sag + Math.sin(u * 7 - phase) * u * .025 * (1 - v), z };
}

/** CanvasTexture's top is UV v=1, including hits from the reverse face. */
export function mistCanvasPoint(uv: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }) {
  const area = MIST_INK_WINDOW;
  return { x: rect.left + (area.x + uv.x * area.width) / 1024 * rect.width,
    y: rect.top + (area.y + (1 - uv.y) * area.height) / 576 * rect.height };
}

export function createMistClothGeometry() {
  const geometry = new THREE.PlaneGeometry(MIST_FLAG.width, MIST_FLAG.height, MIST_FLAG.columns, MIST_FLAG.rows);
  (geometry.getAttribute('position') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  return geometry;
}
