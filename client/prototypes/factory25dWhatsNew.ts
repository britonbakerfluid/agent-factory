import { releaseArtwork } from './factory25dReleaseArtwork';
import { factoryChangelog } from './factory25dChangelog';
import './factory25dWhatsNew.css';

const gamesArtwork = releaseArtwork(factoryChangelog[0].id);

export function createWhatsNew(visitPatio: () => void) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const latest = factoryChangelog[0], storageKey = 'factory-whats-new-seen';
  const root = document.createElement('aside'); root.className = 'factory-updates'; root.setAttribute('aria-label', 'Factory updates');
  root.innerHTML = `<div class="factory-update-preview" id="factory-update-preview" inert><div class="factory-update-content">${gamesArtwork}<span class="factory-update-eyebrow">JUST ADDED</span><h2></h2><p></p><div class="factory-update-actions"><button type="button" data-update="try">find Duck Hunt on the patio ↗</button><button type="button" data-update="history">view changelog</button></div></div></div><button type="button" class="factory-update-trigger" aria-expanded="false" aria-controls="factory-update-preview"><svg class="factory-update-gift" viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">
<path fill="#a85450" d="M6 27h20v2H6z"/>
<path fill="#eb554a" d="M5 14h14v14H5z"/><path fill="#a52d30" d="M19 14h8v10h-2v2h-4v2h-2z"/>
<path fill="#ffe29a" d="M10 14h4v14h-4z"/><path fill="#d6ad66" d="M22 14h3v12h-3z"/>
<g class="factory-gift-glow" fill="#fff0b8"><path opacity=".3" d="M7 14L2 -6h28l-5 20z"/><path opacity=".65" d="M11 14L8 -2h15l-2 16z"/><path d="M7 13h18v4H7zM15 2h3v10h-3z"/></g>
<g class="factory-gift-lid">
<path fill="#ffe09a" d="M3 11h4V9h4V7h14v2h4v6H19v2H3z"/>
<path fill="#f36b5b" d="M3 12h16v5H3z"/><path fill="#b93735" d="M19 12h4v-2h6v5h-4v2h-6z"/>
<path fill="#fff0b8" d="M10 12h4v5h-4zM14 7h4v2h-4v3h-4v-2h4z"/>
<path fill="#a92d35" d="M10 3h4v2h2v2h-4V5h-2v2H8V5h2zM18 3h4v4h-2V5h-2v4h-4V7h2V5h2z"/>
</g>
<path class="factory-gift-spark" fill="#fff5d2" d="M26 2h2v2h2v2h-2v2h-2V6h-2V4h2z"/>
</svg><span>what’s new</span><span class="factory-update-chevron" aria-hidden="true">↑</span></button>`;
  const trigger = root.querySelector<HTMLButtonElement>('.factory-update-trigger')!;
  const preview = root.querySelector<HTMLElement>('.factory-update-preview')!;
  root.querySelector('h2')!.textContent = latest.title; root.querySelector('p')!.textContent = latest.summary;
  try { root.dataset.unread = String(localStorage.getItem(storageKey) !== latest.id); } catch { root.dataset.unread = 'true'; }
  const dialog = document.createElement('dialog'); dialog.className = 'factory-changelog'; dialog.setAttribute('aria-labelledby', 'factory-changelog-title');
  dialog.innerHTML = '<header><div><span class="factory-update-eyebrow">FLUID FACTORY</span><h2 id="factory-changelog-title">What’s new</h2></div><button type="button" aria-label="Close changelog">×</button></header><div class="factory-changelog-entries" tabindex="0" aria-label="Release history"></div>';
  const entries = dialog.querySelector('.factory-changelog-entries')!;
  for (const [index, release] of factoryChangelog.entries()) {
    const article = document.createElement('article');
    const date = document.createElement('time'); date.dateTime = release.date;
    date.textContent = new Date(`${release.date}T12:00:00Z`).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
    const heading = document.createElement('h3'); heading.textContent = release.title;
    const description = document.createElement('p'); description.textContent = release.summary;
    const list = document.createElement('ul');
    for (const change of release.changes) { const li = document.createElement('li'); li.textContent = change; list.append(li); }
    if (index === 0) {
      article.className = 'factory-changelog-featured';
      article.innerHTML = gamesArtwork;
      article.append(date, heading, description);
      const action = document.createElement('button'); action.type = 'button'; action.className = 'factory-changelog-try'; action.textContent = 'find Duck Hunt on the patio ↗';
      action.addEventListener('click', () => { dialog.close(); visitPatio(); }, events);
      const details = document.createElement('details'); details.className = 'factory-release-details';
      const label = document.createElement('summary'); label.textContent = 'More in this update';
      details.append(label, list); article.append(action, details); entries.append(article);
      const archiveHeading = document.createElement('h3'); archiveHeading.className = 'factory-archive-heading'; archiveHeading.textContent = 'Earlier updates'; entries.append(archiveHeading);
    } else {
      const details = document.createElement('details'); details.className = 'factory-release-archive';
      const label = document.createElement('summary'); label.append(date, heading);
      article.innerHTML = releaseArtwork(release.id); article.append(description, list); details.append(label, article); entries.append(details);
    }
  }
  document.body.append(root, dialog);
  let open = false;
  function position() {
    const toolbar = document.querySelector('.factory-toolbar');
    const dock = toolbar?.getBoundingClientRect();
    // Reserve the expanded width so opening never relocates the pill.
    const width = Math.min(340, innerWidth - 24);
    const overlaps = dock && innerWidth - 12 - width < dock.right + 12;
    const bottom = dock
      ? `${overlaps ? innerHeight - dock.top + 12 : innerHeight - (dock.top + dock.height / 2) - trigger.offsetHeight / 2}px`
      : 'max(12px, env(safe-area-inset-bottom))';
    root.style.bottom = bottom; root.style.setProperty('--updates-bottom', bottom);
  }
  function expand(next: boolean) {
    open = next; root.dataset.open = String(next); trigger.setAttribute('aria-expanded', String(next)); preview.inert = !next;
    if (next) { root.dataset.unread = 'false'; try { localStorage.setItem(storageKey, latest.id); } catch { /* Available without browser storage. */ } }
    position();
  }
  root.addEventListener('keydown', event => event.stopPropagation(), events);
  trigger.addEventListener('click', event => { root.dataset.instant = String(event.detail === 0); expand(!open); }, events);
  root.querySelector('[data-update="try"]')!.addEventListener('click', () => { expand(false); visitPatio(); }, events);
  let modalMotion: Animation | undefined;
  let contentMotions: Animation[] = [];
  const clearContentMotion = () => { contentMotions.forEach(motion => motion.cancel()); contentMotions = []; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function morph(from: DOMRect, to: DOMRect, closing = false) {
    modalMotion?.cancel(); clearContentMotion();
    const frame = (rect: DOMRect) => ({ left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, margin:'0', maxHeight:'none' });
    modalMotion = dialog.animate([{...frame(from), backgroundColor:'#000'}, {...frame(to), backgroundColor:'#000'}], { duration:280, easing:'cubic-bezier(.22,1,.36,1)', fill:'both' });
    for (const child of dialog.children) contentMotions.push(child.animate([{opacity:closing ? 1 : 0},{opacity:closing ? 0 : 1}], {duration:closing ? 100 : 180, delay:closing ? 0 : 100, fill:'both'}));
    modalMotion.onfinish = () => { if (closing) dialog.close(); modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); };
  }
  function closeHistory(instant = false) {
    if (instant || reducedMotion.matches) { modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); dialog.close(); return; }
    morph(dialog.getBoundingClientRect(), root.getBoundingClientRect(), true);
  }
  root.querySelector('[data-update="history"]')!.addEventListener('click', event => {
    const from = root.getBoundingClientRect();
    const instant = (event as MouseEvent).detail === 0 || reducedMotion.matches;
    dialog.dataset.instant = 'true'; expand(false); dialog.showModal();
    dialog.querySelector('button')!.focus({preventScroll:true});
    if (!instant) morph(from, dialog.getBoundingClientRect());
  }, events);
  dialog.querySelector('button')!.addEventListener('click', event => closeHistory(event.detail === 0), events);
  dialog.addEventListener('close', () => { modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); trigger.focus({preventScroll:true}); }, events);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeHistory(); } }, events);
  document.addEventListener('pointerdown', event => { if (open && !root.contains(event.target as Node)) expand(false); }, events);
  document.addEventListener('keydown', event => {
    if (dialog.open) {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeHistory(true); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const targets = [...dialog.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')].filter(target => target.getClientRects().length > 0);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
      }
      return;
    }
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); root.dataset.instant = 'true'; expand(false); trigger.focus(); }
  }, { ...events, capture:true });
  const observer = new ResizeObserver(position); const toolbar = document.querySelector('.factory-toolbar'); if (toolbar) observer.observe(toolbar);
  window.addEventListener('resize', position, events); position();
  return { dispose() { abort.abort(); modalMotion?.cancel(); clearContentMotion(); observer.disconnect(); dialog.remove(); root.remove(); } };
}
