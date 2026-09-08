import { PATIO_FLAG } from './factory25dPatioFlagCloth';
export { createPatioFlagGeometry as createMistClothGeometry, patioFlagVertex as mistClothVertex } from './factory25dPatioFlagCloth';

export const MIST_FLAG = {
  ...PATIO_FLAG, x: 18.4, z: -4.35,
} as const;

// Trim the original presentation canvas's empty margin, preserving its aspect
// ratio and the exact pixel geometry. Picking uses this same ink window.
export const MIST_INK_WINDOW = { x: 189, y: 158, width: 480, height: 270 } as const;

/** CanvasTexture's top is UV v=1, including hits from the reverse face. */
export function mistCanvasPoint(uv: { x: number; y: number }, rect: { left: number; top: number; width: number; height: number }) {
  const area = MIST_INK_WINDOW;
  return { x: rect.left + (area.x + uv.x * area.width) / 1024 * rect.width,
    y: rect.top + (area.y + (1 - uv.y) * area.height) / 576 * rect.height };
}
