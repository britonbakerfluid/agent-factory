import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSnackGeometry, snackKind, snackTexture, VENDING_SNACK_KINDS, VENDING_SNACKS,
  SNACK_PIXEL_WIDTH, SNACK_PIXEL_HEIGHT } from '../client/prototypes/factory25dVendingSnacks';
import { VENDING_CAN_HALF_SEGMENT, VENDING_CAN_RADIUS } from '../client/prototypes/factory25dVendingPhysics';

describe('matching floor and held vending snacks', () => {
  it('keeps every modeled packet inside its physical collision capsule', () => {
    for (const kind of VENDING_SNACK_KINDS) {
      const geometry = createSnackGeometry(kind), vertices = geometry.getAttribute('position');
      expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(.11);
      for (let i = 0; i < vertices.count; i++) {
        const beyondEnd = Math.max(0, Math.abs(vertices.getY(i)) - VENDING_CAN_HALF_SEGMENT);
        expect(Math.hypot(vertices.getX(i), vertices.getZ(i), beyondEnd)).toBeLessThanOrEqual(VENDING_CAN_RADIUS + 1e-7);
      }
      geometry.dispose();
    }
  });

  it('preserves item identity after earlier items leave the pile', () => {
    const ids = [0, 1, 2, 3, 4, 5], before = new Map(ids.map(id => [id, snackKind(id)]));
    ids.splice(0, 2);
    expect(new Set(ids.map(snackKind)).size).toBe(3);
    for (const id of ids) expect(snackKind(id)).toBe(before.get(id));
    expect(snackKind(48)).toBe('can');
  });

  it('shares exact packaging colors between 3D models and chunky transparent sprites', () => {
    for (const kind of VENDING_SNACK_KINDS) {
      const geometry = createSnackGeometry(kind), colors = geometry.getAttribute('color');
      const expected = new THREE.Color(VENDING_SNACKS[kind].color);
      let hasBodyColor = false;
      for (let i = 0; i < colors.count; i++) if (Math.abs(colors.getX(i) - expected.r)
        + Math.abs(colors.getY(i) - expected.g) + Math.abs(colors.getZ(i) - expected.b) < 1e-6) hasBodyColor = true;
      expect(hasBodyColor).toBe(true);
      const texture = snackTexture(kind);
      expect(texture).toBe(snackTexture(kind)); expect(texture.magFilter).toBe(THREE.NearestFilter);
      const pixels = texture.image.data as Uint8Array;
      const hex = Number.parseInt(VENDING_SNACKS[kind].color.slice(1), 16);
      let hasPixelBodyColor = false, opaque = 0;
      for (let y = 0; y < SNACK_PIXEL_HEIGHT; y++) for (let x = 0; x < SNACK_PIXEL_WIDTH; x++) {
        const at = (y * SNACK_PIXEL_WIDTH + x) * 4;
        if (pixels[at + 3]) opaque++;
        if (pixels[at] === hex >> 16 && pixels[at + 1] === ((hex >> 8) & 255) && pixels[at + 2] === (hex & 255)) hasPixelBodyColor = true;
        const block = (Math.floor(y / 2) * 2 * SNACK_PIXEL_WIDTH + Math.floor(x / 2) * 2) * 4;
        expect([...pixels.slice(at, at + 4)]).toEqual([...pixels.slice(block, block + 4)]);
      }
      expect(hasPixelBodyColor).toBe(true); expect(opaque).toBeGreaterThan(100); expect(opaque).toBeLessThan(SNACK_PIXEL_WIDTH * SNACK_PIXEL_HEIGHT);
      geometry.dispose();
    }
  });
});
