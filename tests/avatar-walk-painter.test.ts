import { describe, expect, it } from 'vitest';
import { DEFAULT_AVATAR } from '../shared/constants';
import { drawCharacter, hexToInt, resolveAvatar } from '../client/rendering/avatarPainter';

type Rect = { x: number; y: number; width: number; height: number; color: string };
function paint(animation: string, frame: number, avatar = DEFAULT_AVATAR) {
  const pixels = Array.from({ length: 32 }, () => Array<string>(32).fill(''));
  const rectangles: Rect[] = [], colors = resolveAvatar(avatar);
  const ctx = { fillStyle: '', globalAlpha: 1, clearRect() {},
    fillRect(x: number, y: number, width: number, height: number) {
      rectangles.push({ x, y, width, height, color: this.fillStyle });
      for (let row = Math.max(0, y); row < Math.min(32, y + height); row++)
        for (let col = Math.max(0, x); col < Math.min(32, x + width); col++) pixels[row][col] = this.fillStyle;
    },
  };
  drawCharacter(ctx as unknown as CanvasRenderingContext2D, 0, 0, 32, hexToInt(colors.shirtColor), animation, frame, colors);
  return { pixels, rectangles, colors };
}

describe('four-frame pixel walk', () => {
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
