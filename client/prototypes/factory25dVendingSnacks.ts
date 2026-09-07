import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const VENDING_SNACK_KINDS = ['can', 'chips', 'bar'] as const;
export type VendingSnackKind = typeof VENDING_SNACK_KINDS[number];
export const VENDING_SNACKS = {
  can: { name: 'sparkling drink', color: '#81bccc', light: '#b9e0e4', shade: '#4b879a', carryWidth: .144, carryHeight: .216 },
  chips: { name: 'crispy chips', color: '#e6ba65', light: '#f6d68e', shade: '#b18141', carryWidth: .144, carryHeight: .216 },
  bar: { name: 'chocolate bar', color: '#d97572', light: '#efa09a', shade: '#a44c56', carryWidth: .144, carryHeight: .216 },
} as const;

/** Identity belongs to the item ID, never its current index in a shrinking pile. */
export function snackKind(id: number): VendingSnackKind {
  return VENDING_SNACK_KINDS[((Math.floor(id) % VENDING_SNACK_KINDS.length) + VENDING_SNACK_KINDS.length) % VENDING_SNACK_KINDS.length];
}

/** An owned, vertex-coloured model. Every vertex fits the existing capsule so
 * a bag/bar can use the same conservative contact solver as a can. */
export function createSnackGeometry(kind: VendingSnackKind): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], palette = VENDING_SNACKS[kind];
  const part = (geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) => {
    geometry.translate(x, y, z);
    const tint = new THREE.Color(color), count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) tint.toArray(colors, index * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
  };
  const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) => part(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  if (kind === 'can') {
    part(new THREE.CylinderGeometry(.03, .03, .102, 8), palette.color);
    part(new THREE.CylinderGeometry(.019, .03, .011, 8), palette.color, 0, .0565);
    part(new THREE.CylinderGeometry(.03, .019, .011, 8), palette.shade, 0, -.0565);
    for (const y of [-.063, .063]) part(new THREE.CylinderGeometry(.019, .019, .002, 8), '#a6b9b4', 0, y);
    box(.01, .001, .017, '#29403e', 0, .0645);
    part(new THREE.CylinderGeometry(.0305, .0305, .036, 8), '#f7deb5');
    box(.024, .008, .003, '#345b51', 0, 0, .0307);
  } else if (kind === 'chips') {
    // A folded, inflated packet instead of a can recoloured yellow. Its middle
    // bows forward; the narrow ends are sealed with tiny crimped foil seams.
    const packet = new THREE.BoxGeometry(.056, .092, .032, 1, 2, 1);
    const vertices = packet.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const middle = 1 - Math.abs(vertices.getY(i)) / .046;
      vertices.setX(i, vertices.getX(i) * (1 + middle * .055));
      vertices.setZ(i, vertices.getZ(i) * (1 + middle * .16));
    }
    packet.computeVertexNormals(); part(packet, palette.color);
    for (const y of [-.052, .052]) {
      box(.043, .012, .008, palette.shade, 0, y);
      for (const x of [-.015, -.005, .005, .015]) box(.003, .009, .009, palette.light, x, y);
    }
    box(.037, .039, .003, '#f7deb5', 0, 0, .019);
    part(new THREE.CircleGeometry(.009, 6), '#c18b43', -.006, .006, .021);
    part(new THREE.CircleGeometry(.009, 6), '#d7a953', .006, -.006, .0215);
    box(.018, .004, .003, '#795e32', 0, -.021, .019);
  } else {
    // A slim, wrapped chocolate bar with foil at each end and a dark center band.
    box(.037, .096, .022, palette.color);
    for (const y of [-.055, .055]) {
      box(.029, .014, .01, palette.shade, 0, y);
      box(.031, .004, .011, '#b7b9af', 0, y + Math.sign(y) * .002);
    }
    box(.039, .036, .024, '#693f45');
    box(.027, .016, .025, '#f7deb5');
    box(.017, .005, .026, palette.shade);
    box(.004, .09, .003, palette.light, -.014, 0, .012);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const geometry of parts) geometry.dispose();
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

export const SNACK_PIXEL_WIDTH = 16, SNACK_PIXEL_HEIGHT = 24;
const textureCache = new Map<VendingSnackKind, THREE.DataTexture>();

/** Shared pixel art; callers own their sprite material but must not dispose
 * this cached texture when an agent finishes a snack. No canvas/font allocation. */
export function snackTexture(kind: VendingSnackKind): THREE.DataTexture {
  const cached = textureCache.get(kind); if (cached) return cached;
  const palette = VENDING_SNACKS[kind], ink = '#25363b', cream = '#f7deb5', silver = '#a6b9b4';
  const data = new Uint8Array(SNACK_PIXEL_WIDTH * SNACK_PIXEL_HEIGHT * 4);
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    const hex = Number.parseInt(color.slice(1), 16);
    // Draw on an 8x12 logical grid, with 2x2 blocks matching the agents' chunky
    // pixel edges even though the shared upload is a convenient 16x24 texture.
    for (let py = y * 2; py < (y + height) * 2; py++) for (let px = x * 2; px < (x + width) * 2; px++) {
      if (px < 0 || px >= SNACK_PIXEL_WIDTH || py < 0 || py >= SNACK_PIXEL_HEIGHT) continue;
      const index = ((SNACK_PIXEL_HEIGHT - py - 1) * SNACK_PIXEL_WIDTH + px) * 4;
      data[index] = hex >> 16; data[index + 1] = (hex >> 8) & 255; data[index + 2] = hex & 255; data[index + 3] = 255;
    }
  };
  if (kind === 'can') {
    rect(2, 1, 4, 10, ink); rect(2, 2, 4, 8, palette.color);
    rect(3, 1, 2, 1, silver); rect(3, 10, 2, 1, silver);
    rect(2, 3, 1, 6, palette.light); rect(5, 3, 1, 6, palette.shade);
    rect(2, 5, 4, 3, cream); rect(3, 6, 2, 1, '#345b51');
  } else if (kind === 'chips') {
    rect(2, 1, 4, 10, ink); rect(1, 3, 6, 6, ink);
    rect(2, 2, 4, 8, palette.color); rect(1, 4, 6, 4, palette.color);
    rect(2, 1, 4, 1, palette.shade); rect(2, 10, 4, 1, palette.shade);
    for (const x of [2, 4]) { rect(x, 1, 1, 1, palette.light); rect(x, 10, 1, 1, palette.light); }
    rect(1, 4, 1, 4, palette.light); rect(6, 4, 1, 4, palette.shade);
    rect(2, 4, 4, 4, cream); rect(2, 5, 2, 1, '#c18b43'); rect(4, 6, 2, 1, '#d7a953');
    rect(3, 8, 2, 1, '#795e32');
  } else {
    rect(2, 1, 4, 10, ink); rect(2, 2, 4, 8, palette.color);
    rect(2, 3, 1, 6, palette.light); rect(5, 3, 1, 6, palette.shade);
    rect(3, 1, 2, 1, silver); rect(3, 10, 2, 1, silver);
    rect(2, 5, 4, 3, '#693f45'); rect(3, 6, 2, 1, cream);
  }
  const texture = new THREE.DataTexture(data, SNACK_PIXEL_WIDTH, SNACK_PIXEL_HEIGHT, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.name = `vending-snack-${kind}-pixel`; texture.needsUpdate = true;
  textureCache.set(kind, texture); return texture;
}

/** Only the scene/HMR owner should call this, after disposing all snack sprites. */
export function disposeSnackTextures() {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
}
