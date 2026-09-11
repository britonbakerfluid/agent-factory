import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { BRAND_ASSETS, brandAssetUrl, brandPngSize, filterBrandAssets } from '../client/prototypes/factory25dBrandAssets';

it('ships only the nine original self-contained SVGs with their recorded hashes and dimensions', () => {
  const manifest = JSON.parse(readFileSync('client/assets/brand/manifest.json', 'utf8'));
  expect(new Set(BRAND_ASSETS.map(asset => asset.id)).size).toBe(BRAND_ASSETS.length);
  expect(manifest.assets.map((asset: { file: string }) => asset.file).sort()).toEqual(BRAND_ASSETS.map(asset => `${asset.id}.svg`).sort());
  for (const asset of BRAND_ASSETS) {
    const bytes = readFileSync(`client/assets${brandAssetUrl(asset)}`), svg = bytes.toString();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.assets.find((record: { file: string }) => record.file === `${asset.id}.svg`).sha256);
    expect(svg).toContain(`viewBox="0 0 ${asset.width} ${asset.height}"`);
    expect(svg).not.toMatch(/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)|<!ENTITY/i);
  }
});

it('combines brand and multi-word searches without changing the originals', () => {
  expect(filterBrandAssets('Fluid', 'white')).toHaveLength(2);
  expect(filterBrandAssets('We Commerce', 'BLACK symbol').map(asset => asset.id)).toEqual(['we-commerce-logomark-black']);
  expect(filterBrandAssets('All', '  signature   white ')).toHaveLength(1);
  expect(filterBrandAssets('All', 'does not exist')).toEqual([]);
  expect(filterBrandAssets('All', '')).toHaveLength(9);
});

it('exports transparent PNGs with bounded resolution and the original aspect ratio', () => {
  for (const asset of BRAND_ASSETS) {
    const size = brandPngSize(asset);
    expect(Math.max(size.width, size.height)).toBe(2048);
    expect(size.width / size.height).toBeCloseTo(asset.width / asset.height, 2);
    expect(Math.min(size.width, size.height)).toBeGreaterThan(0);
  }
});
