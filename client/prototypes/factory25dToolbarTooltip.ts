/** One contextual tooltip, shared by the dock's real controls in every room. */
export function createToolbarTooltip(toolbar: HTMLElement, id = 'factory-toolbar-tooltip') {
  const abort = new AbortController(), events = {signal:abort.signal};
  const tip = document.createElement('div');
  tip.className = 'factory-toolbar-tooltip'; tip.id = id;
  tip.setAttribute('role','tooltip'); tip.hidden = true; toolbar.append(tip);
  const body=document.createElement('span'); body.className='factory-thought-body';
  const dots=[document.createElement('span'),document.createElement('span')];
  dots.forEach((dot,i)=>{dot.className=`factory-thought-dot dot-${i}`;dot.setAttribute('aria-hidden','true');});
  tip.append(body,...dots);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let motions: Animation[] = [];
  const cancelMotion=()=>{motions.forEach(m=>m.cancel());motions=[];};
  let anchor: HTMLElement | undefined;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let lastHide = -Infinity, lastPointer = -Infinity;
  const hints: Record<string,string> = {
    'window-left':'look left', 'window-right':'look right', 'window-position':'pan across the valley',
    'board-flip':'flip the whiteboard', 'board-page':'see more notes', 'board-reset':'start a new game',
    'board-back':'back to the whiteboard', 'duck-play':'play duck hunt', 'duck-reload':'reload',
  };
  function label(el: HTMLElement) {
    // Suppress the browser's second, unstyled tooltip on legacy view controls.
    if (el.title) { el.dataset.tooltip = el.title; el.removeAttribute('title'); }
    if (el.matches('select')) return 'choose a room';
    return el.dataset.tooltip || hints[el.id] || el.getAttribute('aria-label') || el.textContent?.trim() || '';
  }
  function hide() {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (anchor) {
      const ids = (anchor.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tip.id);
      if (ids.length) anchor.setAttribute('aria-describedby',ids.join(' ')); else anchor.removeAttribute('aria-describedby');
    }
    if (!tip.hidden) lastHide = performance.now();
    anchor = undefined;
    if (!tip.hidden && !reduced.matches) {
      const parts=[body,...dots], current=parts.map(part=>({opacity:getComputedStyle(part).opacity,transform:getComputedStyle(part).transform}));
      cancelMotion();
      motions=parts.map((part,i)=>part.animate([current[i],{opacity:0,transform:'translate(2px, 3px) scale(.4)'}],{duration:90,delay:i*20,fill:'forwards',easing:'ease-in'}));
      motions[2].onfinish=()=>{tip.hidden=true;cancelMotion();};
    } else { cancelMotion(); tip.hidden=true; }
  }
  function target(event: Event) {
    const el = event.target instanceof Element ? event.target.closest<HTMLElement>('button,select,input[type="range"],summary') : null;
    return el && toolbar.contains(el) && !el.closest('.factory-toolbar-ghost,.factory-room-menu,.factory-profile-menu') && !el.dataset.profileMenu && el.getAttribute('aria-expanded') !== 'true' ? el : undefined;
  }
  function reveal(el: HTMLElement) {
    if (!el.isConnected || el.closest('[hidden]') || !el.getBoundingClientRect().width) return;
    cancelMotion(); anchor = el; body.textContent = label(el); tip.hidden = !body.textContent;
    if (tip.hidden) return;
    const ids = new Set((el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    ids.add(tip.id); el.setAttribute('aria-describedby',[...ids].join(' '));
    const bounds = el.getBoundingClientRect(), dock = toolbar.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const center = Math.max(half + 8,Math.min(innerWidth - half - 8,bounds.left + bounds.width / 2));
    tip.style.left = `${center - dock.left}px`;
    tip.style.setProperty('--thought-tail-x',`${bounds.left + bounds.width / 2 - center}px`);
    if(!reduced.matches) motions=[dots[1],dots[0],body].map((part,i)=>part.animate([{opacity:0,transform:'translate(2px, 4px) scale(.4)'},{opacity:1,transform:'translate(0, 0) scale(1)'}],{duration:150,delay:i*30,fill:'backwards',easing:'cubic-bezier(.16,1,.3,1)'}));
  }
  toolbar.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const el = target(event); if (!el || el === anchor) return;
    hide(); anchor = el; label(el);
    showTimer = setTimeout(()=>reveal(el),performance.now() - lastHide < 500 ? 60 : 400);
  }, events);
  toolbar.addEventListener('pointerout', event => {
    if (!anchor || anchor.contains(event.relatedTarget as Node) || tip.contains(event.relatedTarget as Node)) return;
    hideTimer = setTimeout(hide,100);
  }, events);
  tip.addEventListener('pointerenter',()=>{clearTimeout(hideTimer);},events);
  tip.addEventListener('pointerleave',hide,events);
  toolbar.addEventListener('focusin',event=>{
    const el = target(event); if (!el || performance.now() - lastPointer < 700) return;
    hide(); reveal(el);
  },events);
  toolbar.addEventListener('focusout',hide,events);
  document.addEventListener('pointerdown',()=>{lastPointer = performance.now(); hide();},{...events,capture:true});
  document.addEventListener('keydown',event=>{if(event.key === 'Escape') hide();},events);
  window.addEventListener('resize',hide,events);
  const observer = new MutationObserver(hide);
  observer.observe(toolbar,{attributes:true,attributeFilter:['data-view','data-identity']});
  return {dispose(){hide();cancelMotion();abort.abort();observer.disconnect();tip.remove();}};
}
