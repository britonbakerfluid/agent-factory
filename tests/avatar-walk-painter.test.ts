import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import { drawCharacter, hexToInt, resolveAvatar } from '../client/rendering/avatarPainter';
import { AVATAR_ANIMATIONS } from '../client/prototypes/factory25dAvatar';
import { snackHandPose } from '../client/prototypes/factory25dSnackCarry';

type Rect = { x: number; y: number; width: number; height: number; color: string };
function paint(animation: string, frame: number, avatar = DEFAULT_AVATAR, backView = false) {
  const pixels = Array.from({ length: 32 }, () => Array<string>(32).fill(''));
  const rectangles: Rect[] = [], colors = resolveAvatar(avatar);
  const ctx = { fillStyle: '', globalAlpha: 1, clearRect() {},
    fillRect(x: number, y: number, width: number, height: number) {
      rectangles.push({ x, y, width, height, color: this.fillStyle });
      for (let row = Math.max(0, y); row < Math.min(32, y + height); row++)
        for (let col = Math.max(0, x); col < Math.min(32, x + width); col++) pixels[row][col] = this.fillStyle;
    },
  };
  drawCharacter(ctx as unknown as CanvasRenderingContext2D, 0, 0, 32, hexToInt(colors.shirtColor), animation, frame, colors, undefined, false, backView);
  return { pixels, rectangles, colors };
}

describe('four-frame pixel walk', () => {
  it('paints the opposite face on the reverse of a sprite without mirroring its front', () => {
    const front=paint('idle',0), back=paint('idle',0,DEFAULT_AVATAR,true);
    expect(back.pixels.slice(4,15)).not.toEqual(front.pixels.slice(4,15));
    expect(back.pixels.slice(4,15)).toEqual(paint('walk_up',0).pixels.slice(4,15));
    expect(paint('walk_up',0,DEFAULT_AVATAR,true).pixels.slice(4,15)).toEqual(front.pixels.slice(4,15));
  });

  it('anchors a carried snack on actual painted hand pixels in every pose and frame', () => {
    const texture = new THREE.Texture(), pixel = .86 / 32;
    for (const [row, animation] of AVATAR_ANIMATIONS.entries()) for (let frame = 0; frame < 4; frame++) {
      texture.offset.set(frame / 4, 1 - (row + 1) / AVATAR_ANIMATIONS.length);
      const hand = snackHandPose(texture), { pixels, colors } = paint(animation, frame);
      const x = Math.floor(16 + hand.x / pixel), y = Math.floor(16 - hand.y / pixel);
      expect(pixels[y][x], `${animation} frame ${frame}`).toBe(colors.skinTone);
    }
    texture.dispose();
  });
  it('keeps both hands visible and attached throughout the working cycle', () => {
    for (let frame = 0; frame < 4; frame++) {
      const { pixels, colors } = paint('work', frame);
      expect(pixels[21][4]).toBe(colors.skinTone);
      expect(pixels[21][23]).toBe(colors.skinTone);
    }
  });
  it('keeps visible crown and temple hair after painting skin in every side-facing frame', () => {
    for (const hairStyle of [0, 1, 2, 4, 6]) for (const anim of ['walk_right', 'walk_left', 'hold_right', 'hold_left']) for (let frame = 0; frame < 4; frame++) {
      const { pixels } = paint(anim, frame, { ...DEFAULT_AVATAR, hairStyle, hairColor: '#604332' });
      const crown = pixels.slice(4, 8).flat().filter(color => color === '#604332').length;
      expect(crown, `${hairStyle} ${anim} ${frame}`).toBeGreaterThan(8);
      if (hairStyle === 2) {
        expect(pixels.slice(10, 18).flat().filter(color => color === '#604332').length).toBeGreaterThan(12);
      }
    }
  });

  it('retains the board manager glasses and long hair while walking and carrying', () => {
    for (const anim of ['walk_right', 'walk_left', 'hold_right', 'hold_left']) for (let frame = 0; frame < 4; frame++) {
      const { pixels } = paint(anim, frame, { ...DEFAULT_AVATAR, hairStyle: 2, hairColor: '#604332', faceAccessory: 1 });
      expect(pixels.slice(7, 13).flat().filter(color => color === '#666666').length).toBeGreaterThan(8);
      expect(pixels.slice(10, 18).flat().some(color => color === '#604332')).toBe(true);
    }
  });

  it('renders every terminal face and head choice distinctly without bleeding into adjacent side frames', () => {
    for (const [field, count] of [['faceAccessory', 6], ['headAccessory', 7], ['facialHair', 6], ['mouthStyle', 6]] as const) {
      for (const anim of ['walk_left', 'walk_right']) {
        const signatures = new Set<string>();
        for (let choice = 0; choice < count; choice++) for (let frame = 0; frame < 4; frame++) {
          const { pixels, rectangles } = paint(anim, frame, { ...DEFAULT_AVATAR, [field]: choice });
          expect(rectangles.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= 32 && r.y + r.height <= 32), `${field} ${choice}`).toBe(true);
          if (frame === 0) signatures.add(JSON.stringify(pixels.slice(0, 17)));
        }
        expect(signatures.size, `${field} ${anim}`).toBe(count);
      }
    }
  });

  it('keeps cap and bandana fabric tied to the selected shirt, not hair color', () => {
    for (const hairStyle of [3, 7]) {
      const avatar = { ...DEFAULT_AVATAR, hairStyle, shirtColor: '#5f8f78', hairColor: '#604332' };
      expect(paint('walk_right', 0, avatar).pixels).toEqual(paint('walk_right', 0, { ...avatar, hairColor: '#abcdef' }).pixels);
      expect(paint('walk_right', 0, avatar).pixels).not.toEqual(paint('walk_right', 0, { ...avatar, shirtColor: '#ed6644' }).pixels);
    }
  });

  it('keeps both gripping hands fixed while the carrying feet step, using the same avatar colors', () => {
    for (const direction of ['left', 'right', 'up']) {
      const frames = [0, 1, 2, 3].map(frame => paint(`hold_${direction}`, frame));
      const hands = frames.map(({ rectangles, colors }) => rectangles.filter(r => r.color === colors.skinTone && r.y >= 12));
      for (let frame = 1; frame < 4; frame++) expect(hands[frame], direction).toEqual(hands[0]);
      // Opposite contact feet can share a silhouette when both arms hold still.
      expect(new Set(frames.map(({ pixels }) => JSON.stringify(pixels))).size, direction).toBeGreaterThanOrEqual(3);
      for (const { pixels, rectangles } of frames) {
        expect(pixels[31].some(Boolean)).toBe(true);
        expect(rectangles.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= 32 && r.y + r.height <= 32), direction).toBe(true);
      }
    }
  });
  it('paints four distinct poses in every direction, with shoes inside their atlas cell and a steady ground line', () => {
    for (const direction of ['left', 'right', 'up', 'down']) {
      const frames = [0, 1, 2, 3].map(frame => paint(`walk_${direction}`, frame));
      expect(new Set(frames.map(({ pixels }) => JSON.stringify(pixels))).size, direction).toBe(4);
      const tops: number[] = [];
      for (const { pixels, rectangles } of frames) {
        expect(rectangles.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= 32 && r.y + r.height <= 32), direction).toBe(true);
        expect(pixels[31].some(Boolean), direction).toBe(true);
        tops.push(pixels.findIndex(row => row.some(Boolean)));
      }
      expect(Math.max(...tops) - Math.min(...tops), direction).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every leg and shoe connected to the torso, including both profile contact poses', () => {
    for (const direction of ['left', 'right', 'up', 'down']) for (let frame = 0; frame < 4; frame++) {
      const { pixels } = paint(`walk_${direction}`, frame);
      const seen = new Set<number>(), pending = [[16, 17]];
      while (pending.length) {
        const [x, y] = pending.pop()!, key = y * 32 + x;
        if (x < 0 || x >= 32 || y < 0 || y >= 32 || !pixels[y][x] || seen.has(key)) continue;
        seen.add(key); pending.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
      for (let y = 24; y < 32; y++) for (let x = 0; x < 32; x++)
        if (pixels[y][x]) expect(seen.has(y * 32 + x), `${direction} frame ${frame} at ${x},${y}`).toBe(true);
    }
  });

  it('swings the near hand opposite the near shoe while preserving custom clothing colors', () => {
    const centers = [1, 3].map(frame => {
      const { rectangles, colors } = paint('walk_right', frame, { ...DEFAULT_AVATAR, pantsColor: '#5a7164', shoeColor: '#efb56d', skinTone: '#ae704e' });
      const hand = rectangles.findLast(r => r.color === colors.skinTone)!, shoe = rectangles.findLast(r => r.color === colors.shoeColor)!;
      expect(rectangles.some(r => r.color === colors.pantsColor)).toBe(true);
      return { hand: hand.x + hand.width / 2, shoe: shoe.x + shoe.width / 2 };
    });
    expect((centers[0].hand - centers[1].hand) * (centers[0].shoe - centers[1].shoe)).toBeLessThan(0);
  });

  it('alternates a lifted passing foot with two grounded contact feet in every direction', () => {
    for (const direction of ['left', 'right', 'up', 'down']) {
      const grounded = [0, 1, 2, 3].map(frame => {
        const { rectangles, colors } = paint(`walk_${direction}`, frame, { ...DEFAULT_AVATAR, shoeColor: '#efb56d' });
        return rectangles.filter(r => r.color === colors.shoeColor && r.y + r.height === 32).length;
      });
      expect(grounded, direction).toEqual([1, 2, 1, 2]);
    }
  });

  it('moves each planted profile foot evenly backward under the hip and gives both contacts an equal stance', () => {
    for (const direction of ['left', 'right']) {
      const shoes = [0, 1, 2, 3].map(frame => {
        const { rectangles, colors } = paint(`walk_${direction}`, frame, { ...DEFAULT_AVATAR, shoeColor: '#efb56d' });
        return rectangles.filter(r => r.color === colors.shoeColor);
      });
      for (const [leg, phases] of [[0, [3, 0, 1]], [1, [1, 2, 3]]] as const) {
        const planted = phases.map(phase => shoes[phase][leg]);
        expect(planted.every(shoe => shoe.y + shoe.height === 32), direction).toBe(true);
        const expectedTravel = direction === 'right' ? -2 : 2;
        expect(planted[1].x - planted[0].x).toBe(expectedTravel);
        expect(planted[2].x - planted[1].x).toBe(expectedTravel);
      }
      const span = (phase: number) => Math.max(...shoes[phase].map(r => r.x + r.width)) - Math.min(...shoes[phase].map(r => r.x));
      expect(span(1), direction).toBe(span(3));
    }
  });
});
