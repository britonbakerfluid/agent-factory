import { describe, expect, it } from 'vitest';
import { CLOUD_COMPANIES, cloudFigureAt, cloudFigureFromSearch, cloudFigureCompanyAt } from '../client/prototypes/factory25dCloudFigure';
import { CLOUD_COMPANY_MASK_SIZE, cloudCompanyMaskBytes } from '../client/prototypes/factory25dCloudCompanyMasks';

describe('passing cloud figures', () => {
  it('rotates verified launch brands with Fluid in between, changing only in empty sky', () => {
    const order = [0, -1, 1, -1, 2, -1, 0];
    for (const [encounter, company] of order.entries()) {
      const start = encounter * 180;
      expect(cloudFigureCompanyAt(start + 42)).toBe(company);
      expect(cloudFigureCompanyAt((start + 42) / 6, 'cycle')).toBe(company);
      expect(cloudFigureAt(start).presence).toBe(0);
      if (start) expect(cloudFigureAt(start - .01).presence).toBe(0);
    }
    expect(cloudFigureCompanyAt(NaN)).toBe(0);
    expect(cloudFigureCompanyAt(-30)).toBe(0);
    for (const [index, company] of CLOUD_COMPANIES.entries()) {
      expect(cloudFigureFromSearch(`?cloudFigure=${company}`)).toBe(company);
      expect(cloudFigureCompanyAt(9000, company)).toBe(index);
      expect(cloudFigureAt(9000, company)).toEqual({ presence: 1, shape: 1, drift: 0 });
    }
    expect(cloudFigureCompanyAt(400, 'fluid')).toBe(-1);
  });

  it('keeps each baked logo separated, padded and hollow rather than a solid image rectangle', () => {
    const bytes = cloudCompanyMaskBytes(), size = CLOUD_COMPANY_MASK_SIZE;
    expect(bytes.length).toBe(size * size * CLOUD_COMPANIES.length);
    for (let tile = 0; tile < CLOUD_COMPANIES.length; tile++) {
      let body = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const value = bytes[y * size * CLOUD_COMPANIES.length + tile * size + x];
        if (value < 128) body++;
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) expect(value).toBeGreaterThan(200);
      }
      expect(body).toBeGreaterThan(300);
      expect(body).toBeLessThan(size * size * .35);
    }
  });
  it('starts as ordinary sky, gathers into a figure, and releases it before clearing', () => {
    expect(cloudFigureAt(0)).toMatchObject({ presence: 0, shape: 0 });
    expect(cloudFigureAt(13).presence).toBeGreaterThan(0);
    expect(cloudFigureAt(13).presence).toBeLessThan(1);
    expect(cloudFigureAt(13).shape).toBe(0);
    expect(cloudFigureAt(26).presence).toBe(1);
    expect(cloudFigureAt(26).shape).toBeGreaterThan(0);
    expect(cloudFigureAt(26).shape).toBeLessThan(1);
    expect(cloudFigureAt(42)).toMatchObject({ presence: 1, shape: 1 });
    expect(cloudFigureAt(57).shape).toBeGreaterThan(0);
    expect(cloudFigureAt(57).shape).toBeLessThan(1);
    expect(cloudFigureAt(71).shape).toBe(0);
    expect(cloudFigureAt(71).presence).toBeGreaterThan(0);
    expect(cloudFigureAt(90)).toMatchObject({ presence: 0, shape: 0 });
    expect(cloudFigureAt(222)).toEqual(cloudFigureAt(42));
  });

  it.each(['auto', 'cycle'] as const)('stays continuous and bounded through a complete %s cycle', preview => {
    const duration = preview === 'cycle' ? 30 : 180;
    let previous = cloudFigureAt(0, preview), clearFrames = 0;
    for (let frame = 1; frame <= duration * 12 + 1; frame++) {
      const current = cloudFigureAt(frame / 12, preview);
      for (const key of ['presence', 'shape'] as const) {
        expect(current[key]).toBeGreaterThanOrEqual(0);
        expect(current[key]).toBeLessThanOrEqual(1);
        expect(Math.abs(current[key] - previous[key])).toBeLessThan(.08);
      }
      expect(Math.abs(current.drift - previous.drift)).toBeLessThan(.02);
      if (current.presence === 0) clearFrames++;
      previous = current;
    }
    expect(clearFrames).toBeGreaterThan(duration * 12 / 2);
  });

  it('supports a held local review, an accelerated cycle, and an explicit off comparison', () => {
    expect(cloudFigureFromSearch('')).toBe('auto');
    expect(cloudFigureFromSearch('?cloudFigure=unknown')).toBe('auto');
    for (const value of ['fluid', 'cycle', 'off'] as const) {
      expect(cloudFigureFromSearch(`?cloudFigure=${value}`)).toBe(value);
    }
    expect(cloudFigureAt(1000, 'fluid')).toEqual({ presence: 1, shape: 1, drift: 0 });
    expect(cloudFigureAt(42, 'off')).toEqual({ presence: 0, shape: 0, drift: 0 });
    expect(cloudFigureAt(7, 'cycle')).toEqual(cloudFigureAt(42));
  });
});
