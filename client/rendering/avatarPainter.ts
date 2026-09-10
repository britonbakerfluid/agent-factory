import type { AvatarConfig } from '@shared/types';

export const AGENT_COLORS = [
  0x4a90d9, // blue
  0xff6b6b, // red
  0x51cf66, // green
  0xffd43b, // yellow
  0xcc5de8, // purple
  0xff922b, // orange
  0x20c997, // teal
  0xf06595, // pink
];

export const HAIR_COLOR_HEXES = [
  '#332211', // dark brown
  '#664422', // medium brown
  '#222222', // black
  '#aa6633', // light brown
  '#880000', // dark red
  '#553311', // chestnut
  '#444444', // gray
  '#cc8844', // sandy blonde
  '#e8d5b5', // platinum blonde
  '#8b4513', // auburn
  '#ff2200', // bright red
  '#aaaaaa', // silver
  '#0a0a1a', // blue black
  '#b89a5a', // dirty blonde
];

// Hair style drawing functions per spriteIndex
type HairDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, hairColor: string, bodyColor: string) => void;

const HAIR_STYLES: HairDrawFn[] = [
  // 0: Short flat
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y, 12, 4);
    ctx.fillRect(x + 9, y + 1, 1, 3);
    ctx.fillRect(x + 22, y + 1, 1, 3);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 13, y + 1, 6, 1);
  },
  // 1: Spiky
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y + 2, 12, 3);
    ctx.fillRect(x + 11, y, 2, 2);
    ctx.fillRect(x + 15, y - 2, 2, 4);
    ctx.fillRect(x + 19, y - 1, 2, 3);
    ctx.fillRect(x + 13, y + 1, 2, 1);
    ctx.fillRect(x + 17, y, 1, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 15, y - 1, 1, 2);
  },
  // 2: Long sides
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y, 12, 5);
    ctx.fillRect(x + 8, y + 4, 2, 8);
    ctx.fillRect(x + 22, y + 4, 2, 8);
    ctx.fillRect(x + 9, y + 2, 1, 4);
    ctx.fillRect(x + 22, y + 2, 1, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 13, y + 1, 6, 2);
  },
  // 3: Cap/hat (uses body color)
  (ctx, x, y, _hc, bc) => {
    ctx.fillStyle = bc;
    ctx.fillRect(x + 8, y, 16, 5);
    ctx.fillRect(x + 6, y + 4, 20, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 10, y + 1, 8, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x + 6, y + 5, 20, 1);
  },
  // 4: Mohawk
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 14, y - 4, 4, 8);
    ctx.fillRect(x + 13, y - 2, 6, 2);
    ctx.fillRect(x + 10, y + 2, 12, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 15, y - 3, 2, 4);
  },
  // 5: Bald (just skin highlight)
  (ctx, x, y) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 12, y, 8, 2);
    ctx.fillRect(x + 14, y - 1, 4, 1);
  },
  // 6: Afro
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 8, y - 2, 16, 8);
    ctx.fillRect(x + 6, y, 2, 4);
    ctx.fillRect(x + 24, y, 2, 4);
    ctx.fillRect(x + 7, y - 1, 1, 3);
    ctx.fillRect(x + 24, y - 1, 1, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 12, y - 1, 6, 2);
  },
  // 7: Bandana (body colored)
  (ctx, x, y, _hc, bc) => {
    ctx.fillStyle = bc;
    ctx.fillRect(x + 8, y, 16, 4);
    ctx.fillRect(x + 6, y + 2, 2, 2);
    ctx.fillRect(x + 24, y + 2, 2, 2);
    ctx.fillRect(x + 24, y + 3, 3, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 12, y + 1, 8, 1);
  },
];

// Deliberate rear views for every supported haircut. These avoid front-only
// details and let longer styles continue behind the neck and shoulders.
const BACK_HAIR_STYLES: HairDrawFn[] = [
  // 0: Short flat
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y, 12, 6);
    ctx.fillRect(x + 9, y + 2, 2, 5);
    ctx.fillRect(x + 21, y + 2, 2, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 12, y + 1, 7, 1);
  },
  // 1: Spiky
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y + 1, 12, 6);
    ctx.fillRect(x + 10, y - 1, 3, 3);
    ctx.fillRect(x + 14, y - 3, 3, 4);
    ctx.fillRect(x + 19, y - 2, 3, 4);
    ctx.fillRect(x + 9, y + 3, 2, 4);
    ctx.fillRect(x + 21, y + 3, 2, 4);
  },
  // 2: Long hair, visible down the back and outside both shoulders
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 9, y, 14, 10);
    ctx.fillRect(x + 8, y + 4, 3, 13);
    ctx.fillRect(x + 21, y + 4, 3, 13);
    ctx.fillRect(x + 11, y + 7, 10, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 12, y + 1, 7, 2);
  },
  // 3: Cap
  (ctx, x, y, _hc, bc) => {
    ctx.fillStyle = bc;
    ctx.fillRect(x + 8, y, 16, 6);
    ctx.fillRect(x + 7, y + 4, 18, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + 9, y + 5, 14, 1);
  },
  // 4: Mohawk
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 14, y - 4, 4, 10);
    ctx.fillRect(x + 12, y + 2, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 15, y - 3, 1, 6);
  },
  // 5: Bald
  (ctx, x, y) => {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x + 13, y, 6, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 11, y + 6, 10, 1);
  },
  // 6: Afro
  (ctx, x, y, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 8, y - 2, 16, 10);
    ctx.fillRect(x + 6, y, 20, 6);
    ctx.fillRect(x + 9, y + 6, 14, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 11, y - 1, 7, 2);
  },
  // 7: Bandana
  (ctx, x, y, _hc, bc) => {
    ctx.fillStyle = bc;
    ctx.fillRect(x + 8, y, 16, 5);
    ctx.fillRect(x + 6, y + 3, 20, 2);
    ctx.fillRect(x + 24, y + 5, 3, 2);
    ctx.fillRect(x + 25, y + 7, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x + 9, y + 4, 14, 1);
  },
];

// Mouth style drawing functions (fixed colors per style)
type FaceDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number) => void;

const MOUTH_STYLES: FaceDrawFn[] = [
  // 0: Default (none)
  () => {},
  // 1: Smile
  (ctx, x, y, b) => {
    ctx.fillStyle = '#cc6666';
    ctx.fillRect(x + 14, y + 12 + b, 4, 1);
    ctx.fillRect(x + 13, y + 11 + b, 1, 1);
    ctx.fillRect(x + 18, y + 11 + b, 1, 1);
  },
  // 2: Frown
  (ctx, x, y, b) => {
    ctx.fillStyle = '#886666';
    ctx.fillRect(x + 14, y + 11 + b, 4, 1);
    ctx.fillRect(x + 13, y + 12 + b, 1, 1);
    ctx.fillRect(x + 18, y + 12 + b, 1, 1);
  },
  // 3: Open
  (ctx, x, y, b) => {
    ctx.fillStyle = '#331111';
    ctx.fillRect(x + 14, y + 11 + b, 4, 2);
    ctx.fillStyle = '#cc6666';
    ctx.fillRect(x + 14, y + 12 + b, 4, 1);
  },
  // 4: Teeth Grin
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 14, y + 12 + b, 4, 1);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(x + 16, y + 12 + b, 1, 1);
  },
  // 5: Tongue Out
  (ctx, x, y, b) => {
    ctx.fillStyle = '#cc6666';
    ctx.fillRect(x + 14, y + 12 + b, 4, 1);
    ctx.fillStyle = '#ff6699';
    ctx.fillRect(x + 15, y + 13 + b, 2, 1);
  },
];

// Facial hair drawing functions (uses hairColor)
type FacialHairDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, hairColor: string) => void;

const FACIAL_HAIR_STYLES: FacialHairDrawFn[] = [
  // 0: None
  () => {},
  // 1: Stubble
  (ctx, x, y, b, hc) => {
    ctx.fillStyle = hc; ctx.globalAlpha = 0.4;
    ctx.fillRect(x + 12, y + 12 + b, 1, 1);
    ctx.fillRect(x + 14, y + 13 + b, 1, 1);
    ctx.fillRect(x + 17, y + 13 + b, 1, 1);
    ctx.fillRect(x + 19, y + 12 + b, 1, 1);
    ctx.fillRect(x + 16, y + 12 + b, 1, 1);
    ctx.globalAlpha = 1.0;
  },
  // 2: Mustache
  (ctx, x, y, b, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 12, y + 11 + b, 8, 1);
    ctx.fillRect(x + 13, y + 10 + b, 2, 1);
    ctx.fillRect(x + 17, y + 10 + b, 2, 1);
  },
  // 3: Full Beard
  (ctx, x, y, b, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 10, y + 11 + b, 12, 3);
    ctx.fillRect(x + 12, y + 14 + b, 8, 2);
    ctx.fillRect(x + 14, y + 16 + b, 4, 1);
  },
  // 4: Goatee
  (ctx, x, y, b, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 14, y + 11 + b, 4, 3);
    ctx.fillRect(x + 15, y + 14 + b, 2, 1);
  },
  // 5: Soul Patch
  (ctx, x, y, b, hc) => {
    ctx.fillStyle = hc;
    ctx.fillRect(x + 15, y + 13 + b, 2, 2);
  },
];

// Face accessory drawing functions (fixed colors, follows bounce + eyeY)
type FaceAccDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, eyeY: number) => void;

const FACE_ACCESSORIES: FaceAccDrawFn[] = [
  // 0: None
  () => {},
  // 1: Round Glasses
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#666666';
    // Left lens frame
    ctx.fillRect(x + 10, y + ey - 1 + b, 5, 1);
    ctx.fillRect(x + 10, y + ey + 3 + b, 5, 1);
    ctx.fillRect(x + 10, y + ey + b, 1, 3);
    ctx.fillRect(x + 14, y + ey + b, 1, 3);
    // Right lens frame
    ctx.fillRect(x + 17, y + ey - 1 + b, 5, 1);
    ctx.fillRect(x + 17, y + ey + 3 + b, 5, 1);
    ctx.fillRect(x + 17, y + ey + b, 1, 3);
    ctx.fillRect(x + 21, y + ey + b, 1, 3);
    // Bridge
    ctx.fillRect(x + 14, y + ey + b, 3, 1);
    // Lens tint
    ctx.fillStyle = 'rgba(200,220,255,0.15)';
    ctx.fillRect(x + 11, y + ey + b, 3, 3);
    ctx.fillRect(x + 18, y + ey + b, 3, 3);
  },
  // 2: Sunglasses
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + 10, y + ey + b, 5, 3);
    ctx.fillRect(x + 17, y + ey + b, 5, 3);
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 15, y + ey + b, 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 11, y + ey + b, 2, 1);
    ctx.fillRect(x + 18, y + ey + b, 2, 1);
  },
  // 3: Monocle
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#ccaa44';
    ctx.fillRect(x + 17, y + ey - 1 + b, 5, 1);
    ctx.fillRect(x + 17, y + ey + 3 + b, 5, 1);
    ctx.fillRect(x + 17, y + ey + b, 1, 3);
    ctx.fillRect(x + 21, y + ey + b, 1, 3);
    ctx.fillRect(x + 21, y + ey + 4 + b, 1, 4);
    ctx.fillRect(x + 22, y + ey + 6 + b, 1, 2);
  },
  // 4: Eye Patch
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#222222';
    ctx.fillRect(x + 10, y + ey - 1 + b, 5, 5);
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 8, y + ey - 3 + b, 2, 2);
    ctx.fillRect(x + 16, y + ey - 3 + b, 8, 1);
  },
  // 5: Visor
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#00ffff';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + 8, y + ey + b, 16, 3);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#008888';
    ctx.fillRect(x + 8, y + ey + b, 16, 1);
  },
];

// Head accessory drawing functions (fixed colors, drawn on top of hair)
type HeadAccDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number) => void;

const HEAD_ACCESSORIES: HeadAccDrawFn[] = [
  // 0: None
  () => {},
  // 1: Crown
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + 10, y + 2 + b, 12, 4);
    ctx.fillRect(x + 10, y + b, 2, 2);
    ctx.fillRect(x + 14, y - 1 + b, 2, 3);
    ctx.fillRect(x + 20, y + b, 2, 2);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 12, y + 2 + b, 2, 2);
    ctx.fillStyle = '#0044ff';
    ctx.fillRect(x + 18, y + 2 + b, 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x + 12, y + 1 + b, 8, 1);
  },
  // 2: Top Hat
  (ctx, x, y, b) => {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + 12, y + b - 4, 8, 6);
    ctx.fillRect(x + 8, y + b + 2, 16, 2);
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(x + 12, y + b, 8, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 13, y + b - 3, 2, 4);
  },
  // 3: Halo
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ffdd44';
    ctx.fillRect(x + 12, y + b - 1, 8, 1);
    ctx.fillRect(x + 10, y + b, 2, 2);
    ctx.fillRect(x + 20, y + b, 2, 2);
    ctx.fillRect(x + 12, y + b + 2, 8, 1);
    ctx.fillStyle = 'rgba(255,255,100,0.3)';
    ctx.fillRect(x + 13, y + b, 6, 2);
  },
  // 4: Devil Horns
  (ctx, x, y, b) => {
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(x + 8, y + 2 + b, 4, 4);
    ctx.fillRect(x + 20, y + 2 + b, 4, 4);
    ctx.fillRect(x + 8, y + b, 2, 2);
    ctx.fillRect(x + 22, y + b, 2, 2);
    ctx.fillStyle = '#880000';
    ctx.fillRect(x + 8, y + b + 1, 1, 1);
    ctx.fillRect(x + 23, y + b + 1, 1, 1);
  },
  // 5: Antenna
  (ctx, x, y, b) => {
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 16, y + b - 2, 1, 6);
    ctx.fillRect(x + 15, y + b - 1, 3, 1);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x + 15, y + b - 4, 3, 3);
    ctx.fillStyle = 'rgba(0,255,0,0.3)';
    ctx.fillRect(x + 14, y + b - 5, 5, 5);
  },
  // 6: Flower
  (ctx, x, y, b) => {
    ctx.fillStyle = '#22aa22';
    ctx.fillRect(x + 21, y + 6 + b, 1, 3);
    ctx.fillStyle = '#ff69b4';
    ctx.fillRect(x + 20, y + 4 + b, 3, 1);
    ctx.fillRect(x + 20, y + 8 + b, 3, 1);
    ctx.fillRect(x + 19, y + 5 + b, 1, 3);
    ctx.fillRect(x + 23, y + 5 + b, 1, 3);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 20, y + 5 + b, 3, 3);
  },
];

// Shirt design drawing functions (derived from shirt color)
type ShirtDesignDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, breathe: number, darkColor: string, lightColor: string) => void;

const SHIRT_DESIGNS: ShirtDesignDrawFn[] = [
  // 0: Solid (none)
  () => {},
  // 1: H-Stripe
  (ctx, x, y, b, br, dc) => {
    ctx.fillStyle = dc;
    ctx.fillRect(x + 8, y + 18 + b + br, 16, 2);
  },
  // 2: V-Stripe
  (ctx, x, y, b, br, _dc, lc) => {
    ctx.fillStyle = lc;
    ctx.fillRect(x + 14, y + 16 + b + br, 4, 6);
  },
  // 3: Heart
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 12, y + 16 + b + br, 3, 2);
    ctx.fillRect(x + 17, y + 16 + b + br, 3, 2);
    ctx.fillRect(x + 11, y + 18 + b + br, 10, 2);
    ctx.fillRect(x + 13, y + 20 + b + br, 6, 1);
    ctx.fillRect(x + 15, y + 21 + b + br, 2, 1);
  },
  // 4: Star
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 15, y + 16 + b + br, 2, 1);
    ctx.fillRect(x + 12, y + 17 + b + br, 8, 2);
    ctx.fillRect(x + 14, y + 19 + b + br, 4, 1);
    ctx.fillRect(x + 13, y + 20 + b + br, 2, 1);
    ctx.fillRect(x + 17, y + 20 + b + br, 2, 1);
  },
  // 5: Number 1
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 15, y + 16 + b + br, 2, 5);
    ctx.fillRect(x + 13, y + 16 + b + br, 2, 2);
    ctx.fillRect(x + 13, y + 21 + b + br, 6, 1);
  },
  // 6: Skull
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 13, y + 16 + b + br, 6, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 14, y + 17 + b + br, 2, 2);
    ctx.fillRect(x + 17, y + 17 + b + br, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 14, y + 20 + b + br, 4, 1);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 15, y + 20 + b + br, 1, 1);
    ctx.fillRect(x + 17, y + 20 + b + br, 1, 1);
  },
  // 7: Checkerboard
  (ctx, x, y, b, br, dc) => {
    ctx.fillStyle = dc;
    ctx.fillRect(x + 8, y + 16 + b + br, 2, 2);
    ctx.fillRect(x + 12, y + 16 + b + br, 2, 2);
    ctx.fillRect(x + 16, y + 16 + b + br, 2, 2);
    ctx.fillRect(x + 20, y + 16 + b + br, 2, 2);
    ctx.fillRect(x + 10, y + 18 + b + br, 2, 2);
    ctx.fillRect(x + 14, y + 18 + b + br, 2, 2);
    ctx.fillRect(x + 18, y + 18 + b + br, 2, 2);
    ctx.fillRect(x + 22, y + 18 + b + br, 2, 2);
    ctx.fillRect(x + 8, y + 20 + b + br, 2, 2);
    ctx.fillRect(x + 12, y + 20 + b + br, 2, 2);
    ctx.fillRect(x + 16, y + 20 + b + br, 2, 2);
    ctx.fillRect(x + 20, y + 20 + b + br, 2, 2);
  },
  // 8: Diamond
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 15, y + 16 + b + br, 2, 1);
    ctx.fillRect(x + 14, y + 17 + b + br, 4, 1);
    ctx.fillRect(x + 13, y + 18 + b + br, 6, 1);
    ctx.fillRect(x + 14, y + 19 + b + br, 4, 1);
    ctx.fillRect(x + 15, y + 20 + b + br, 2, 1);
  },
  // 9: Lightning
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 16, y + 16 + b + br, 3, 1);
    ctx.fillRect(x + 15, y + 17 + b + br, 3, 1);
    ctx.fillRect(x + 14, y + 18 + b + br, 3, 1);
    ctx.fillRect(x + 15, y + 19 + b + br, 3, 1);
    ctx.fillRect(x + 16, y + 20 + b + br, 3, 1);
    ctx.fillRect(x + 15, y + 21 + b + br, 3, 1);
  },
  // 10: Dots
  (ctx, x, y, b, br, _dc, lc) => {
    ctx.fillStyle = lc;
    ctx.fillRect(x + 10, y + 16 + b + br, 1, 1);
    ctx.fillRect(x + 14, y + 16 + b + br, 1, 1);
    ctx.fillRect(x + 18, y + 16 + b + br, 1, 1);
    ctx.fillRect(x + 22, y + 16 + b + br, 1, 1);
    ctx.fillRect(x + 12, y + 18 + b + br, 1, 1);
    ctx.fillRect(x + 16, y + 18 + b + br, 1, 1);
    ctx.fillRect(x + 20, y + 18 + b + br, 1, 1);
    ctx.fillRect(x + 10, y + 20 + b + br, 1, 1);
    ctx.fillRect(x + 14, y + 20 + b + br, 1, 1);
    ctx.fillRect(x + 18, y + 20 + b + br, 1, 1);
    ctx.fillRect(x + 22, y + 20 + b + br, 1, 1);
  },
  // 11: X-Cross
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 10, y + 16 + b + br, 2, 1);
    ctx.fillRect(x + 20, y + 16 + b + br, 2, 1);
    ctx.fillRect(x + 12, y + 17 + b + br, 2, 1);
    ctx.fillRect(x + 18, y + 17 + b + br, 2, 1);
    ctx.fillRect(x + 14, y + 18 + b + br, 4, 2);
    ctx.fillRect(x + 12, y + 20 + b + br, 2, 1);
    ctx.fillRect(x + 18, y + 20 + b + br, 2, 1);
    ctx.fillRect(x + 10, y + 21 + b + br, 2, 1);
    ctx.fillRect(x + 20, y + 21 + b + br, 2, 1);
  },
];

/** Resolve granular avatar fields with backwards-compat fallbacks. */
export function resolveAvatar(avatar: AvatarConfig) {
  const spriteIdx = avatar.spriteIndex ?? 0;
  const shirtHex = avatar.shirtColor ?? avatar.color ?? '#4a90d9';
  return {
    hairStyle: avatar.hairStyle ?? (spriteIdx % 8),
    hairColor: avatar.hairColor ?? HAIR_COLOR_HEXES[spriteIdx % HAIR_COLOR_HEXES.length],
    skinTone: avatar.skinTone ?? '#ffcc99',
    shirtColor: shirtHex,
    pantsColor: avatar.pantsColor ?? '#2a2a3e',
    shoeColor: avatar.shoeColor ?? '#222222',
    facialHair: avatar.facialHair ?? 0,
    mouthStyle: avatar.mouthStyle ?? 0,
    faceAccessory: avatar.faceAccessory ?? 0,
    headAccessory: avatar.headAccessory ?? 0,
    shirtDesign: avatar.shirtDesign ?? 0,
  };
}

/** Generate a deterministic texture key for an avatar config. */
export function avatarTextureKey(avatar: AvatarConfig): string {
  const r = resolveAvatar(avatar);
  return `avatar_${r.hairStyle}_${r.hairColor}_${r.skinTone}_${r.shirtColor}_${r.pantsColor}_${r.shoeColor}_${r.facialHair}_${r.mouthStyle}_${r.faceAccessory}_${r.headAccessory}_${r.shirtDesign}`.replace(/#/g, '');
}

/** Convert hex color string to integer. */
export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export type AvatarEyes = 'center' | 'left' | 'right' | 'up' | 'blink';

export function drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    size: number,
    color: number,
    anim: string,
    frame: number,
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string; facialHair: number; mouthStyle: number; faceAccessory: number; headAccessory: number; shirtDesign: number },
    eyes?: AvatarEyes,
    frontFacing = false,
  ) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const bodyColor = `rgb(${r}, ${g}, ${b})`;
    const darkColor = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`;
    const lightColor = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
    const skinColor = colors.skinTone;
    const hairColor = colors.hairColor;
    const climbing = anim === 'climb';
    const sitting = anim === 'sit' || anim === 'sit_up';
    const holding = anim.startsWith('hold_');
    const facesAway = !frontFacing && (anim === 'work' || anim === 'walk_up' || anim === 'sit_up' || anim === 'board' || anim === 'hold_up' || climbing);

    ctx.clearRect(x, y, size, size);

    if (anim === 'walk_left' || anim === 'walk_right' || anim === 'hold_left' || anim === 'hold_right') {
      drawSideCharacter(
        ctx,
        x,
        y,
        anim.endsWith('right') ? 'right' : 'left',
        frame,
        colors,
        bodyColor,
        darkColor,
        lightColor,
        holding,
        eyes,
      );
      return;
    }

    const walking = anim.startsWith('walk') || holding;
    // Passing / contact / passing / contact. The head moves only one pixel;
    // the planted shoe stays on row 31 throughout the cycle.
    const bounce = walking && !holding ? [0, 1, 0, 1][frame % 4] : 0;
    const leftLift = walking ? [0, 0, 1, 0][frame % 4] : 0;
    const rightLift = walking ? [1, 0, 0, 0][frame % 4] : 0;
    const armSwing = walking ? [0, 1, 0, -1][frame % 4] : 0;
    const breathe = (anim === 'idle' && frame === 2) ? 1 : 0;

    // ── Head (skin) — rounded shape ──
    ctx.fillStyle = skinColor;
    ctx.fillRect(x + 11, y + 4 + bounce, 10, 10);
    ctx.fillRect(x + 10, y + 5 + bounce, 12, 8);
    // Ears
    ctx.fillRect(x + 9, y + 7 + bounce, 1, 3);
    ctx.fillRect(x + 22, y + 7 + bounce, 1, 3);
    // Head shading (right side + ear)
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 20, y + 5 + bounce, 2, 8);
    ctx.fillRect(x + 22, y + 8 + bounce, 1, 2);
    // Chin highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 13, y + 12 + bounce, 6, 1);

    // ── Hair / hat ──
    const hairStyles = facesAway ? BACK_HAIR_STYLES : HAIR_STYLES;
    const drawHair = hairStyles[colors.hairStyle % hairStyles.length];
    drawHair(ctx, x, y + 4 + bounce, hairColor, bodyColor);

    if (!facesAway) {
      // ── Face ──
      const isBlink = eyes === 'blink' || (eyes === undefined && anim === 'idle' && frame === 2);
      const eyeY = 8;
      if (isBlink) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 12, y + eyeY + 1 + bounce, 3, 1);
        ctx.fillRect(x + 18, y + eyeY + 1 + bounce, 3, 1);
      } else if (eyes !== undefined) {
        // Prepainted expression variants keep glasses/hair in front of the eyes.
        // Pupils stay inside a four-pixel white; no floating face overlay.
        const glance = eyes === 'left' ? 0 : eyes === 'right' ? 2 : 1;
        for (const left of [11, 18]) {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x + left, y + eyeY + bounce, 4, 3);
          ctx.fillStyle = '#4466aa'; ctx.fillRect(x + left + glance, y + eyeY + bounce, 2, eyes === 'up' ? 2 : 3);
          ctx.fillStyle = '#17243b'; ctx.fillRect(x + left + glance, y + eyeY + bounce + (eyes === 'up' ? 0 : 1), 2, 1);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x + left + glance + 1, y + eyeY + bounce, 1, 1);
        }
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 12, y + eyeY + bounce, 3, 3);
        ctx.fillRect(x + 18, y + eyeY + bounce, 3, 3);
        ctx.fillStyle = '#4466aa';
        ctx.fillRect(x + 13, y + eyeY + bounce, 2, 3);
        ctx.fillRect(x + 19, y + eyeY + bounce, 2, 3);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 13, y + eyeY + 1 + bounce, 2, 1);
        ctx.fillRect(x + 19, y + eyeY + 1 + bounce, 2, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 14, y + eyeY + bounce, 1, 1);
        ctx.fillRect(x + 20, y + eyeY + bounce, 1, 1);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + 16, y + 10 + bounce, 1, 2);

      const drawMouth = MOUTH_STYLES[colors.mouthStyle % MOUTH_STYLES.length];
      drawMouth(ctx, x, y, bounce);

      const drawBeard = FACIAL_HAIR_STYLES[colors.facialHair % FACIAL_HAIR_STYLES.length];
      drawBeard(ctx, x, y, bounce, hairColor);

      const drawFaceAcc = FACE_ACCESSORIES[colors.faceAccessory % FACE_ACCESSORIES.length];
      drawFaceAcc(ctx, x, y, bounce, eyeY);
    }

    // ── Head accessory ──
    const drawHeadAcc = HEAD_ACCESSORIES[colors.headAccessory % HEAD_ACCESSORIES.length];
    drawHeadAcc(ctx, x, y, bounce);

    // ── Neck ──
    ctx.fillStyle = skinColor;
    ctx.fillRect(x + 14, y + 14 + bounce, 4, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 17, y + 14 + bounce, 1, 2);

    // ── Shirt / body ──
    ctx.fillStyle = bodyColor;
    if (sitting) {
      ctx.fillRect(x + 8, y + 15 + bounce, 16, 8);
    } else if (anim === 'work') {
      ctx.fillRect(x + 6, y + 15 + bounce, 16, 8);
    } else {
      ctx.fillRect(x + 8, y + 15 + bounce + breathe, 16, 8);
    }

    // Body shading (right side)
    ctx.fillStyle = darkColor;
    if (sitting) {
      ctx.fillRect(x + 22, y + 15 + bounce, 2, 8);
    } else if (anim === 'work') {
      ctx.fillRect(x + 20, y + 15 + bounce, 2, 8);
    } else {
      ctx.fillRect(x + 22, y + 15 + bounce + breathe, 2, 8);
    }

    // Body highlight (left side)
    ctx.fillStyle = lightColor;
    if (sitting) {
      ctx.fillRect(x + 8, y + 16 + bounce, 1, 4);
    } else if (anim === 'work') {
      ctx.fillRect(x + 6, y + 16 + bounce, 1, 4);
    } else {
      ctx.fillRect(x + 8, y + 16 + bounce + breathe, 1, 4);
    }

    // Collar
    ctx.fillStyle = lightColor;
    if (sitting) {
      ctx.fillRect(x + 12, y + 15 + bounce, 8, 1);
    } else if (anim === 'work') {
      ctx.fillRect(x + 10, y + 15 + bounce, 8, 1);
    } else {
      ctx.fillRect(x + 12, y + 15 + bounce, 8, 1);
    }

    // ── Shirt design ──
    const drawDesign = SHIRT_DESIGNS[colors.shirtDesign % SHIRT_DESIGNS.length];
    if (sitting) {
      drawDesign(ctx, x, y, bounce, 0, darkColor, lightColor);
    } else if (anim === 'work') {
      drawDesign(ctx, x - 2, y, bounce, 0, darkColor, lightColor);
    } else {
      drawDesign(ctx, x, y, bounce, breathe, darkColor, lightColor);
    }

    // ── Belt ──
    ctx.fillStyle = '#443322';
    if (sitting) {
      ctx.fillRect(x + 8, y + 22 + bounce, 16, 1);
    } else if (anim === 'work') {
      ctx.fillRect(x + 6, y + 22 + bounce, 16, 1);
    } else {
      ctx.fillRect(x + 8, y + 22 + bounce + breathe, 16, 1);
    }
    // Belt buckle
    ctx.fillStyle = '#887744';
    if (sitting) {
      ctx.fillRect(x + 15, y + 22 + bounce, 2, 1);
    } else if (anim === 'work') {
      ctx.fillRect(x + 13, y + 22 + bounce, 2, 1);
    } else {
      ctx.fillRect(x + 15, y + 22 + bounce + breathe, 2, 1);
    }

    // ── Pants ──
    ctx.fillStyle = colors.pantsColor;
    if (sitting) {
      ctx.fillRect(x + 8, y + 23, 16, 4);
    } else if (anim === 'work') {
      ctx.fillRect(x + 6, y + 23 + bounce, 16, 4);
    } else {
      ctx.fillRect(x + 8, y + 23 + bounce + breathe, 16, walking ? 3 : 4);
    }

    // ── Arms ──
    ctx.fillStyle = darkColor;
    if (holding) {
      // Both hands keep contact with the frame while the feet take short steps.
      ctx.fillRect(x + 5, y + 14, 4, 6);
      ctx.fillRect(x + 23, y + 14, 4, 6);
      ctx.fillStyle = skinColor;
      ctx.fillRect(x + 5, y + 12, 3, 3);
      ctx.fillRect(x + 24, y + 12, 3, 3);
    } else if (anim === 'paddle') {
      // A seated two-handed stroke. Keep the shoulders and head steady while
      // the hands follow the canoe's four paddle poses; the hull hides the lap.
      const reach = [0, 2, 1, -1][frame % 4];
      ctx.fillRect(x + 5, y + 16, 4, 5);
      ctx.fillRect(x + 8, y + 19 + reach, 8, 3);
      ctx.fillRect(x + 23, y + 16, 4, 4 + reach);
      ctx.fillStyle = skinColor;
      ctx.fillRect(x + 15, y + 19 + reach, 4, 3);
      ctx.fillRect(x + 24, y + 19 + reach, 3, 3);
    } else if (anim === 'board') {
      ctx.fillRect(x + 5, y + 16, 4, 6);
      ctx.fillRect(x + 23, y + 11, 3, 9);
      ctx.fillStyle = skinColor;
      ctx.fillRect(x + 24, y + 8 - frame % 2, 3, 4);
      ctx.fillRect(x + 5, y + 21, 3, 2);
    } else if (climbing) {
      // Alternate reaching hands, keeping the same saved clothes and silhouette.
      for (const [side, armX] of [5, 24].entries()) {
        const reach = [3, 1, 0, 1][(frame + side * 2) % 4];
        ctx.fillStyle = darkColor;
        ctx.fillRect(x + armX, y + 12 - reach, 3, 7 + reach);
        ctx.fillStyle = skinColor;
        ctx.fillRect(x + armX, y + 7 - reach, 3, 5);
      }
    } else if (anim === 'work') {
      ctx.fillRect(x + 3, y + 16 + bounce, 4, 6);
      ctx.fillRect(x + 21, y + 16 + bounce, 4, 6);
      // Hands
      ctx.fillStyle = skinColor;
      // Both hands stay attached; alternate the key press, not visibility.
      ctx.fillRect(x + 3, y + 20 + bounce + frame % 2, 3, 2);
      ctx.fillRect(x + 22, y + 21 + bounce - frame % 2, 3, 2);
    } else if (sitting) {
      ctx.fillRect(x + 5, y + 16 + bounce, 4, 6);
      ctx.fillRect(x + 23, y + 16 + bounce, 4, 6);
      ctx.fillStyle = skinColor;
      ctx.fillRect(x + 5, y + 21 + bounce, 3, 2);
      ctx.fillRect(x + 24, y + 21 + bounce, 3, 2);
    } else if (walking) {
      // Sleeves stay attached at the shoulder. Each hand swings opposite its
      // leg, shortening the forearm in depth rather than moving the whole arm.
      for (const [armX, handX, reach] of [[5, 5, -armSwing], [23, 24, armSwing]]) {
        ctx.fillStyle = darkColor;
        ctx.fillRect(x + armX, y + 16 + bounce, 4, 3);
        ctx.fillRect(x + armX, y + 19 + bounce, 4, 3 - reach);
        ctx.fillStyle = skinColor;
        ctx.fillRect(x + handX, y + 22 + bounce - reach, 3, 2);
      }
    } else {
      const swing = 0;
      ctx.fillRect(x + 5, y + 16 + bounce + swing, 4, 6);
      ctx.fillRect(x + 23, y + 16 + bounce - swing, 4, 6);
      // Hands
      ctx.fillStyle = skinColor;
      ctx.fillRect(x + 5, y + 21 + bounce + swing, 3, 2);
      ctx.fillRect(x + 24, y + 21 + bounce - swing, 3, 2);
    }

    // ── Legs ──
    ctx.fillStyle = colors.pantsColor;
    if (climbing) {
      for (const [side, legX] of [9, 18].entries()) {
        const lift = [3, 1, 0, 0][(frame + side * 2) % 4];
        ctx.fillStyle = colors.pantsColor;
        ctx.fillRect(x + legX, y + 25 - lift, 5, 5);
        ctx.fillStyle = colors.shoeColor;
        ctx.fillRect(x + legX - 1, y + 30 - lift, 6, 2);
      }
      return;
    } else if (walking) {
      for (const [legX, lift] of [[10, leftLift], [18, rightLift]]) {
        const shoeY = 30 - lift;
        ctx.fillStyle = colors.pantsColor;
        ctx.fillRect(x + legX, y + 25 + bounce, 4, shoeY - 25 - bounce);
        ctx.fillStyle = colors.shoeColor;
        ctx.fillRect(x + legX - 1, y + shoeY, 5, 2);
        ctx.fillStyle = '#111111';
        ctx.fillRect(x + legX - 1, y + shoeY + 1, 5, 1);
      }
      return;
    } else if (sitting) {
      ctx.fillRect(x + 10, y + 26, 4, 4);
      ctx.fillRect(x + 18, y + 26, 4, 4);
    } else {
      const legOffset = anim.startsWith('walk') ? (frame % 2 === 0 ? 2 : -2) : 0;
      ctx.fillRect(x + 10, y + 27 + bounce, 4, 3);
      ctx.fillRect(x + 18, y + 27 + bounce + legOffset, 4, 3);
    }

    // ── Shoes ──
    ctx.fillStyle = colors.shoeColor;
    if (!sitting) {
      const legOffset = anim.startsWith('walk') ? (frame % 2 === 0 ? 2 : -2) : 0;
      ctx.fillRect(x + 9, y + 30 + bounce, 5, 2);
      ctx.fillRect(x + 17, y + 30 + bounce + legOffset, 5, 2);
      // Shoe sole
      ctx.fillStyle = '#111111';
      ctx.fillRect(x + 9, y + 31 + bounce, 5, 1);
      ctx.fillRect(x + 17, y + 31 + bounce + legOffset, 5, 1);
    } else {
      ctx.fillRect(x + 10, y + 29, 4, 2);
      ctx.fillRect(x + 18, y + 29, 4, 2);
    }
  }

function drawSideCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: 'left' | 'right',
    frame: number,
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string; facialHair: number; mouthStyle: number; faceAccessory: number; headAccessory: number; shirtDesign: number },
    bodyColor: string,
    darkColor: string,
    lightColor: string,
    holding = false,
    eyes?: AvatarEyes,
  ) {
    const bounce = holding ? 0 : [0, 1, 0, 1][frame % 4];
    const stride = [0, 2, 0, -2][frame % 4];
    const rect = (left: number, top: number, width: number, height: number, color: string) => {
      ctx.fillStyle = color;
      const px = facing === 'right' ? x + left : x + 32 - left - width;
      ctx.fillRect(px, y + top + bounce, width, height);
    };

    const leg = (shift: number, lift: number) => {
      // Both legs pivot under the same profile hip. Separating the hips in X
      // made one contact pose splay out and the other fold across itself.
      const hipX = 14;
      rect(hipX, 24, 4, 3, colors.pantsColor);
      rect(hipX + shift, 26, 4, 4 - lift - bounce, colors.pantsColor);
      // Cancel the torso bob at the shoe: its contact point is the ground.
      rect(hipX + shift - 1, 30 - lift - bounce, 6, 2, colors.shoeColor);
      rect(hipX + shift - 1, 31 - lift - bounce, 6, 1, '#111111');
    };

    // Rear limbs sit behind the torso. Knees overlap the fixed hip, and arms
    // swing opposite the same-side leg instead of marching together.
    if (holding) {
      rect(13, 17, 11, 3, darkColor);
      rect(24, 16, 3, 3, colors.skinTone);
    } else {
      rect(12, 17, 3, 4, darkColor);
      rect(12 + stride, 20, 3, 3, darkColor);
      rect(12 + stride, 23, 3, 2, colors.skinTone);
    }
    leg(-stride, [0, 0, 1, 0][frame % 4]);

    rect(14, 14, 4, 2, colors.skinTone);

    // Paint the body and skin before the visible hair. Drawing skin over the
    // haircut erased its crown and temple whenever a character turned sideways.
    rect(10, 15, 11, 9, bodyColor);
    rect(10, 16, 2, 6, darkColor);
    rect(19, 16, 2, 6, lightColor);
    rect(14, 15, 5, 1, lightColor);
    rect(11, 23, 10, 1, '#443322');
    if (colors.shirtDesign === 1 || colors.shirtDesign === 7) rect(11, 19, 10, 1, 'rgba(255,255,255,.45)');
    if (colors.shirtDesign === 2) rect(20, 16, 1, 7, 'rgba(255,255,255,.5)');
    // Only the front edge of a chest emblem is visible in a true profile.
    const emblem = ['', '', '', '#ff4444', '#ffdd44', '#ffffff', '#dddddd', '#eeeeee', '#44ddff', '#ffff44', '#ffffff', '#eeeeee'][colors.shirtDesign];
    if (emblem) {
      rect(20, 18, 1, 3, emblem);
      if (colors.shirtDesign === 9) rect(19, 20, 2, 1, emblem);
    }

    rect(11, 5, 10, 9, colors.skinTone);
    rect(20, 8, 2, 4, colors.skinTone);
    rect(22, 9, 1, 2, colors.skinTone);
    rect(11, 6, 2, 7, 'rgba(0,0,0,.1)');
    rect(18, 12, 3, 1, 'rgba(255,255,255,.08)');
    rect(21, 11, 1, 1, 'rgba(0,0,0,.13)');

    const hair = colors.hairColor, highlight = 'rgba(255,255,255,.13)', shade = 'rgba(0,0,0,.16)';
    switch (colors.hairStyle % 8) {
      case 0: // Short, with a visible temple and a clean nape.
        rect(10, 4, 11, 4, hair); rect(9, 5, 3, 6, hair); rect(12, 7, 3, 2, hair);
        rect(12, 5, 6, 1, highlight); rect(10, 8, 1, 3, shade); break;
      case 1: // Spiky silhouette follows the front-view haircut.
        rect(10, 5, 11, 3, hair); rect(9, 5, 4, 6, hair);
        rect(11, 2, 3, 4, hair); rect(16, 1, 2, 5, hair); rect(19, 3, 2, 3, hair);
        rect(16, 2, 1, 3, highlight); rect(10, 8, 1, 3, shade); break;
      case 2: // Long hair falls over the back shoulder, never over the face.
        rect(10, 4, 11, 4, hair); rect(9, 7, 5, 11, hair); rect(9, 17, 4, 2, hair);
        rect(18, 7, 2, 1, hair); rect(12, 5, 6, 1, highlight);
        rect(10, 9, 1, 7, highlight); rect(13, 12, 1, 5, shade); break;
      case 3: // Cap and bandana use the selected shirt color, just like the terminal.
        rect(10, 3, 11, 4, bodyColor); rect(9, 5, 3, 4, bodyColor);
        rect(17, 7, 7, 1, darkColor); rect(13, 4, 6, 1, highlight); break;
      case 4:
        rect(12, 0, 4, 7, hair); rect(10, 3, 8, 2, hair); rect(10, 7, 4, 2, hair);
        rect(13, 1, 1, 4, highlight); break;
      case 5:
        rect(13, 5, 5, 1, 'rgba(255,255,255,.2)'); break;
      case 6:
        rect(8, 2, 13, 7, hair); rect(6, 4, 3, 8, hair); rect(8, 8, 5, 6, hair);
        rect(13, 7, 3, 2, hair); rect(10, 3, 6, 2, highlight); rect(8, 10, 2, 3, shade); break;
      case 7:
        rect(9, 4, 12, 4, bodyColor); rect(8, 6, 3, 3, bodyColor);
        rect(7, 8, 3, 2, bodyColor); rect(8, 10, 2, 3, bodyColor);
        rect(11, 5, 7, 1, highlight); rect(10, 7, 11, 1, darkColor); break;
    }
    // Ear, single eye and small nose keep the same face readable in profile.
    rect(14, 9, 2, 3, colors.skinTone); rect(14, 10, 1, 1, 'rgba(0,0,0,.14)');
    if (eyes === 'blink') rect(18, 9, 2, 1, '#1b2440');
    else {
      const lookingBack = facing === 'right' ? eyes === 'left' : eyes === 'right';
      const pupil = lookingBack ? 18 : 19;
      rect(18, 8, 2, 3, '#ffffff'); rect(pupil, 8, 1, eyes === 'up' ? 2 : 3, '#4466aa');
      rect(pupil, eyes === 'up' ? 8 : 9, 1, 1, '#1b2440');
    }
    switch (colors.mouthStyle) {
      case 1: rect(20, 12, 2, 1, '#cc6666'); rect(21, 11, 1, 1, '#cc6666'); break;
      case 2: rect(20, 11, 2, 1, '#886666'); rect(21, 12, 1, 1, '#886666'); break;
      case 3: rect(20, 12, 2, 2, '#331111'); break;
      case 4: rect(20, 12, 2, 1, '#ffffff'); break;
      case 5: rect(20, 12, 2, 1, '#cc6666'); rect(21, 13, 2, 1, '#ff6699'); break;
      default: rect(20, 12, 2, 1, 'rgba(0,0,0,.18)');
    }
    switch (colors.facialHair) {
      case 1:
        ctx.globalAlpha = .4; rect(17, 12, 1, 1, hair); rect(19, 13, 1, 1, hair); rect(21, 12, 1, 1, hair); ctx.globalAlpha = 1; break;
      case 2: rect(19, 11, 3, 1, hair); rect(19, 10, 1, 1, hair); break;
      case 3:
        rect(16, 11, 2, 3, hair); rect(17, 13, 5, 2, hair); rect(19, 15, 2, 1, hair);
        rect(17, 12, 1, 2, highlight); break;
      case 4: rect(20, 12, 2, 3, hair); rect(20, 15, 1, 1, hair); break;
      case 5: rect(20, 13, 1, 2, hair); break;
    }
    switch (colors.faceAccessory) {
      case 1: case 3: {
        const rim = colors.faceAccessory === 3 ? '#ccaa44' : '#666666';
        rect(17, 7, 5, 1, rim); rect(17, 11, 5, 1, rim); rect(17, 8, 1, 3, rim); rect(21, 8, 1, 3, rim);
        rect(18, 8, 3, 3, 'rgba(200,220,255,.15)');
        if (colors.faceAccessory === 1) rect(14, 8, 3, 1, rim);
        else rect(21, 12, 1, 4, rim);
        break;
      }
      case 2:
        rect(17, 8, 5, 3, '#111111'); rect(14, 8, 3, 1, '#333333'); rect(18, 8, 2, 1, highlight); break;
      case 4:
        rect(17, 7, 5, 4, '#222222'); rect(12, 6, 5, 1, '#333333'); rect(15, 7, 2, 1, '#333333'); break;
      case 5:
        rect(14, 8, 8, 3, '#00bbbb'); rect(14, 8, 8, 1, '#008888'); rect(18, 9, 3, 1, '#77ffff'); break;
    }

    // The near hand passes in front of the thigh on its backward swing.
    leg(stride, [1, 0, 0, 0][frame % 4]);
    // The leading sleeve keeps its shoulder while the forearm changes angle.
    if (holding) {
      rect(17, 17, 3, 4, bodyColor);
      rect(19, 18, 7, 3, bodyColor);
      rect(26, 17, 3, 3, colors.skinTone);
    } else {
      rect(17, 17, 3, 4, bodyColor);
      rect(17 - stride, 20, 3, 3, bodyColor);
      rect(18 - stride, 23, 3, 2, colors.skinTone);
    }
    // Profile accessories stay inside this 32px atlas cell in every walk frame.
    switch (colors.headAccessory) {
      case 1:
        rect(10, 2, 11, 3, '#ffd700'); rect(11, 0, 2, 2, '#ffd700'); rect(17, 0, 2, 2, '#ffd700');
        rect(17, 3, 2, 1, '#0044ff'); rect(12, 3, 2, 1, '#ff0000'); break;
      case 2:
        rect(11, 0, 8, 5, '#111111'); rect(9, 5, 14, 2, '#111111');
        rect(11, 3, 8, 2, '#cc0000'); rect(12, 1, 1, 2, 'rgba(255,255,255,.15)'); break;
      case 3:
        rect(11, 0, 9, 1, '#ffdd44'); rect(10, 1, 1, 1, '#ffdd44'); rect(20, 1, 1, 1, '#ffdd44'); rect(11, 2, 9, 1, '#ffdd44'); break;
      case 4:
        rect(10, 2, 3, 4, '#880000'); rect(10, 0, 1, 3, '#cc0000');
        rect(17, 2, 3, 4, '#cc0000'); rect(19, 0, 1, 3, '#cc0000'); break;
      case 5:
        rect(14, 2, 1, 4, '#888888'); rect(13, 0, 3, 2, '#00ff00'); rect(14, 0, 1, 1, '#bbffbb'); break;
      case 6:
        rect(13, 6, 1, 3, '#22aa22'); rect(11, 4, 5, 3, '#ff69b4');
        rect(12, 3, 3, 5, '#ff69b4'); rect(13, 5, 1, 1, '#ffdd44'); break;
    }
  }
