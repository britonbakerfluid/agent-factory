export const CLOUD_COMPANIES = ['wellnah', 'nuvamed', 'oliabo'] as const;
export type CloudCompany = typeof CLOUD_COMPANIES[number];
export type CloudFigurePreview = 'auto' | 'fluid' | 'cycle' | 'off' | CloudCompany;

const isCompany = (value: string | null): value is CloudCompany =>
  CLOUD_COMPANIES.some(company => company === value);

export function cloudFigureFromSearch(search: string): CloudFigurePreview {
  const value = new URLSearchParams(search).get('cloudFigure');
  return value === 'fluid' || value === 'cycle' || value === 'off' || isCompany(value) ? value : 'auto';
}

const elapsed = (seconds: number, preview: CloudFigurePreview) =>
  Math.max(0, Number.isFinite(seconds) ? seconds : 0) * (preview === 'cycle' ? 6 : 1);

/** Newest first, with Fluid between launches. Switch only while the sky is empty. */
export function cloudFigureCompanyAt(seconds: number, preview: CloudFigurePreview = 'auto'): number {
  if (preview === 'fluid' || preview === 'off') return -1;
  if (isCompany(preview)) return CLOUD_COMPANIES.indexOf(preview);
  const encounter = Math.floor(elapsed(seconds, preview) / 180);
  return encounter % 2 === 1 ? -1 : Math.floor(encounter / 2) % CLOUD_COMPANIES.length;
}

const ease = (start: number, end: number, time: number) => {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
};

/** A passing cloud gathers, holds its shape, then loosens back into ordinary air. */
export function cloudFigureAt(seconds: number, preview: CloudFigurePreview = 'auto') {
  if (preview === 'off') return { presence: 0, shape: 0, drift: 0 };
  if (preview === 'fluid' || isCompany(preview)) return { presence: 1, shape: 1, drift: 0 };
  const time = elapsed(seconds, preview);
  const phase = time % 180;
  return {
    presence: ease(8, 18, phase) * (1 - ease(65, 78, phase)),
    shape: ease(18, 34, phase) * (1 - ease(49, 65, phase)),
    drift: Math.sin(phase * Math.PI / 90) * .34,
  };
}

// Fluid's four drop outlines follow client/assets/brand/fluid-logomark.svg:
// upper drops have square lower-right corners; lower drops have square
// upper-left corners. All other corners retain their round contour.
// These are 3D density shapes sampled by the existing view AND sunlight rays.
export const CLOUD_FIGURE_GLSL = `
  float figureBox(vec2 p, vec2 halfSize) {
    vec2 q = abs(p) - halfSize;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  float fluidDrop(vec2 p, float corner) {
    float circle = length(p) - 0.425;
    vec2 squareCenter = vec2(0.2125, -0.2125) * corner;
    return -roundedUnion(-circle, -figureBox(p - squareCenter, vec2(0.2125)), 0.055);
  }
  float fluidOutline(vec2 p) {
    float upper = min(fluidDrop(p - vec2(-0.48, 0.51), 1.0),
      fluidDrop(p - vec2(0.48, 0.51), 1.0));
    float lower = min(fluidDrop(p - vec2(-0.48, -0.51), -1.0),
      fluidDrop(p - vec2(0.48, -0.51), -1.0));
    return min(upper, lower);
  }
  float companyOutline(vec2 p) {
    vec2 uv = clamp(p / 3.4 + 0.5, vec2(0.00390625), vec2(0.99609375));
    uv.x = (uv.x + cloudFigureCompany) / 3.0;
    return texture2D(cloudFigureMasks, uv).r - 0.5;
  }
  float figureDensity(vec3 p, float background) {
    if (cloudFigure.x < 0.001) return background;
    vec3 q = (p - vec3(-4.1 + cloudFigure.z, 3.72, -18.0)) / 1.38;
    if (abs(q.x) > 1.7 || abs(q.y) > 1.25 || abs(q.z) > 1.5) return background;
    // A slight tilt exposes the volume's lower surfaces. Unequal thickness
    // and 3D erosion keep the mark from becoming a flat sign in the sky.
    q.yz = mat2(0.985, -0.174, 0.174, 0.985) * q.yz;
    float folds = noise3(q * 4.8 + vec3(cloudTime * 0.008, 8.2, 1.4));
    float detail = noise3(q * 12.0 + vec3(5.7, 1.8, 6.1));
    // Broad, slowly changing folds soften the drawn contour without adding
    // fine fizz or losing the gaps that make each logo recognizable.
    vec3 billow = q * 2.3 + vec3(cloudTime * 0.004, 0.0, 0.0);
    vec2 waviness = vec2(noise3(billow + 2.7), noise3(billow + 9.3)) - 0.5;
    // Thin lettering needs gentler erosion than the broad Fluid drops. Every
    // mark remains a density volume, lit by the same sky and sunlight samples.
    float company = step(-0.5, cloudFigureCompany);
    vec2 contour = q.xy + waviness * mix(0.23, 0.065, company);
    float outline = cloudFigureCompany < -0.5 ? fluidOutline(contour) : companyOutline(contour);
    float depth = 0.12 + (0.28 + folds * 0.55) * sqrt(smoothstep(0.0, 0.34, -outline));
    float shaped = max(outline, (abs(q.z) - depth) * 0.7);
    shaped += ((folds - 0.5) * 0.15 + (detail - 0.5) * 0.045) * mix(1.0, 0.42, company);
    float loose = 1.0 - length(q / vec3(1.23, 0.44, 0.65));
    loose = roundedUnion(loose, 1.0 - length((q - vec3(-0.38, 0.29, 0.07))
      / vec3(0.58, 0.61, 0.60)), 0.22);
    loose = roundedUnion(loose, 1.0 - length((q - vec3(0.49, 0.18, -0.16))
      / vec3(0.68, 0.45, 0.62)), 0.18);
    float field = mix(-loose * 0.30 + (folds - 0.5) * 0.08, shaped, cloudFigure.y);
    float body = (1.0 - smoothstep(-0.045, 0.065, field)) * max(cloudCover, 0.38) * 1.7;
    // Nearby wisps collect into the figure; they return as it breaks apart.
    float clearing = 1.0 - smoothstep(1.35, 1.7, length(q * vec3(0.8, 1.0, 0.5)));
    return max(background * (1.0 - cloudFigure.x * clearing), body * cloudFigure.x);
  }
  float figureSkylight(vec3 p) {
    // Evaluate the first visible surface only. Ambient sky light describes
    // the billows within the silhouette, where direct sun is self-occluded.
    vec3 x = vec3(0.11, 0.0, 0.0), y = x.yxz, z = x.yzx;
    vec3 gradient = vec3(figureDensity(p - x, 0.0) - figureDensity(p + x, 0.0),
      figureDensity(p - y, 0.0) - figureDensity(p + y, 0.0),
      figureDensity(p - z, 0.0) - figureDensity(p + z, 0.0));
    vec3 normal = gradient / max(length(gradient), 0.001);
    return clamp(0.24 + dot(normal, normalize(vec3(-0.6, 0.8, 1.1))) * 0.60, 0.05, 0.85);
  }
`;
