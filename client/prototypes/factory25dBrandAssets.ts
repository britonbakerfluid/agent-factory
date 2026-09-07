/** Exact SVG exports from the Fluid design-system brand folder. */
export const BRAND_ASSETS = [
  { id: 'fluid-lockup', brand: 'Fluid', title: 'Full logo', variant: 'White', width: 177, height: 61 },
  { id: 'fluid-logomark', brand: 'Fluid', title: 'Symbol', variant: 'White', width: 62, height: 64 },
  { id: 'we-commerce-logotype-black', brand: 'We Commerce', title: 'Full signature', variant: 'Black', width: 2358, height: 600 },
  { id: 'we-commerce-logotype-white', brand: 'We Commerce', title: 'Full signature', variant: 'White', width: 2358, height: 600 },
  { id: 'we-commerce-wordmark-black', brand: 'We Commerce', title: 'Wordmark', variant: 'Black', width: 2358, height: 600 },
  { id: 'we-commerce-wordmark-white', brand: 'We Commerce', title: 'Wordmark', variant: 'White', width: 2358, height: 600 },
  { id: 'we-commerce-logomark-black', brand: 'We Commerce', title: 'Symbol', variant: 'Black', width: 1024, height: 1024 },
  { id: 'we-commerce-logomark-white', brand: 'We Commerce', title: 'Symbol', variant: 'White', width: 1024, height: 1024 },
] as const;
export type BrandAsset = typeof BRAND_ASSETS[number];
export const brandAssetUrl = (asset: BrandAsset) => `/brand/${asset.id}.svg`;
export function filterBrandAssets(brand: string, query: string): readonly BrandAsset[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return BRAND_ASSETS.filter(asset => (brand === 'All' || asset.brand === brand)
    && words.every(word => `${asset.brand} ${asset.title} ${asset.variant} ${asset.id} svg`.toLowerCase().includes(word)));
}
export function brandPngSize(asset: Pick<BrandAsset, 'width' | 'height'>) {
  const scale = 2048 / Math.max(asset.width, asset.height);
  return { width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) };
}
