/** Coordinates supplied by the renderer's pointer adapter. */
export interface Point {
  x: number;
  y: number;
}

/** Pointer travel in pixels before a press becomes a grab. */
export const GRAB_DRAG_THRESHOLD = 4;
