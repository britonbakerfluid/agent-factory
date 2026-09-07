import * as THREE from 'three';
import { createBrandShelf } from './factory25dBrandShelf';
import { BRAND_ASSETS, brandAssetUrl, brandPngSize, filterBrandAssets, type BrandAsset } from './factory25dBrandAssets';
import './factory25dBrandLibrary.css';

type Room = 'factory' | 'patio';
export function createBrandLibrary(parent: THREE.Group, canvas: HTMLCanvasElement, onOpen: () => void) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const shelf = createBrandShelf(parent);
  const triggers: Array<{ target: THREE.Object3D; room: Room; button: HTMLButtonElement }> = [];
  let active = false, available: Room | undefined, previousFocus: HTMLElement | null = null, brand = 'All';
  const urls = new Set<string>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const dialog = document.createElement('dialog'); dialog.className = 'brand-library';
  dialog.setAttribute('aria-labelledby', 'brand-library-title');
  dialog.innerHTML = `<section class="brand-library-sheet"><header class="brand-library-header"><div><p>FLUID FACTORY / BRAND SHELF</p><h2 id="brand-library-title">the brand shelf</h2><span>Fluid + We Commerce logos, ready for your next thing.</span></div><a class="brand-bundle" href="/brand/fluid-we-commerce-logos.zip" download="fluid-we-commerce-logos.zip">download all ↓ <small>8 originals · ZIP</small></a></header><div class="brand-library-tools"><div class="brand-library-filters" role="group" aria-label="Filter by brand"></div><input type="search" aria-label="Find a logo" placeholder="find a logo…"></div><p class="brand-library-count" role="status"></p><div class="brand-library-grid"></div><footer>Original SVGs stay crisp at any size. PNGs have a transparent background.</footer></section><nav class="brand-library-dock pixel-island"><button type="button">← room</button><span>brand shelf</span></nav>`;
  document.body.append(dialog);
  const grid = dialog.querySelector<HTMLElement>('.brand-library-grid')!;
  const count = dialog.querySelector<HTMLElement>('.brand-library-count')!;
  const search = dialog.querySelector<HTMLInputElement>('input')!;
  const filters = dialog.querySelector<HTMLElement>('.brand-library-filters')!;
  const back = dialog.querySelector<HTMLButtonElement>('nav button')!;
  function close() {
    if (!active) return;
    active = false; dialog.close(); document.body.classList.remove('brand-open');
    if (previousFocus?.isConnected) { previousFocus.hidden = false; previousFocus.focus({ preventScroll: true }); }
  }
  function open(button: HTMLButtonElement) {
    if (active || !available || button.hidden) return;
    previousFocus = button; onOpen(); active = true;
    document.body.classList.add('brand-open'); dialog.showModal(); back.focus();
  }
  function addTrigger(target: THREE.Object3D, room: Room, label: string) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'brand-hotspot'; button.hidden = true;
    button.setAttribute('aria-label', label); button.title = 'open the brand shelf';
    canvas.parentElement!.append(button); button.addEventListener('click', () => open(button), events);
    triggers.push({ target, room, button });
  }
  async function png(asset: BrandAsset, button: HTMLButtonElement) {
    button.disabled = true; button.textContent = 'making…';
    try {
      const image = new Image(); image.src = brandAssetUrl(asset); await image.decode();
      if (abort.signal.aborted) return;
      const size = brandPngSize(asset), output = document.createElement('canvas');
      output.width = size.width; output.height = size.height;
      output.getContext('2d')!.drawImage(image, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
      if (!blob || abort.signal.aborted) return;
      const url = URL.createObjectURL(blob); urls.add(url);
      const link = document.createElement('a'); link.href = url; link.download = `${asset.id}.png`;
      document.body.append(link); link.click(); link.remove();
      const timer = setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer); }, 60_000); timers.add(timer);
      count.textContent = `${asset.brand} ${asset.title.toLowerCase()} · transparent PNG ready`;
    } catch { if (!abort.signal.aborted) count.textContent = 'PNG could not be created. You can still download the original SVG.'; }
    finally { button.disabled = false; button.textContent = 'PNG ↓'; }
  }
  function paint() {
    const assets = filterBrandAssets(brand, search.value);
    count.textContent = `${assets.length} of ${BRAND_ASSETS.length} original logo files`;
    grid.replaceChildren();
    for (const asset of assets) {
      const card = document.createElement('article'); card.className = 'brand-asset';
      const preview = document.createElement('div'); preview.className = 'brand-asset-preview'; preview.dataset.surface = asset.variant === 'White' ? 'ink' : 'paper';
      const image = document.createElement('img'); image.src = brandAssetUrl(asset); image.alt = `${asset.brand} ${asset.title.toLowerCase()}, ${asset.variant.toLowerCase()}`;
      image.width = asset.width; image.height = asset.height; preview.append(image);
      const details = document.createElement('div'); details.className = 'brand-asset-details';
      const label = document.createElement('p'); label.textContent = `${asset.brand} / ${asset.variant}`;
      const title = document.createElement('h3'); title.textContent = asset.title;
      const actions = document.createElement('div'); actions.className = 'brand-asset-actions';
      const svg = document.createElement('a'); svg.href = brandAssetUrl(asset); svg.download = `${asset.id}.svg`; svg.textContent = 'SVG ↓'; svg.setAttribute('aria-label', `Download ${asset.brand} ${asset.title} ${asset.variant} SVG`);
      const raster = document.createElement('button'); raster.type = 'button'; raster.textContent = 'PNG ↓'; raster.setAttribute('aria-label', `Download ${asset.brand} ${asset.title} ${asset.variant} PNG`);
      // Cards are replaced when filtering; local listeners are collected with them.
      raster.addEventListener('click', () => { void png(asset, raster); });
      actions.append(svg, raster); details.append(label, title, actions); card.append(preview, details); grid.append(card);
    }
    if (!assets.length) { const empty = document.createElement('p'); empty.className = 'brand-library-empty'; empty.textContent = 'No logos match that. Try Fluid, We Commerce, white, or black.'; grid.append(empty); }
  }
  for (const name of ['All', 'Fluid', 'We Commerce']) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = name; button.setAttribute('aria-pressed', String(name === brand));
    button.addEventListener('click', () => { brand = name; for (const item of filters.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button)); paint(); }, events); filters.append(button);
  }
  search.addEventListener('input', paint, events); back.addEventListener('click', close, events);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, events);
  dialog.addEventListener('keydown', event => event.stopPropagation(), events);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); }, events);
  addTrigger(shelf.target, 'factory', 'Open the brand artifact shelf'); paint();
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  return { isActive: () => active, addTrigger,
    update(camera: THREE.Camera, room?: Room) {
      available = room;
      for (const { target, room: targetRoom, button } of triggers) {
        button.hidden = active || room !== targetRoom;
        if (button.hidden) continue;
        target.updateWorldMatrix(true, true); bounds.setFromObject(target);
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, inFront = false;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          point.set(x, y, z).project(camera); inFront ||= point.z >= -1 && point.z <= 1;
          const px = (point.x + 1) * canvas.clientWidth / 2, py = (1 - point.y) * canvas.clientHeight / 2;
          left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
        if (!inFront || right < 0 || left > canvas.clientWidth || bottom < 0 || top > canvas.clientHeight) { button.hidden = true; continue; }
        const width = Math.max(44, right - left), height = Math.max(44, bottom - top);
        Object.assign(button.style, { left: `${(left + right - width) / 2}px`, top: `${(top + bottom - height) / 2}px`, width: `${width}px`, height: `${height}px` });
      }
    },
    dispose() {
      close(); abort.abort(); shelf.dispose(); dialog.remove(); triggers.forEach(({ button }) => button.remove());
      timers.forEach(clearTimeout); urls.forEach(url => URL.revokeObjectURL(url));
    },
  };
}
