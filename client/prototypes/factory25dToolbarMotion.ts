/** Preserve the dock and spatial continuity while its real controls change views. */
export function createToolbarMotion(toolbar: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  let keyboard = false;
  document.addEventListener('keydown', () => { keyboard = true; }, {capture:true,signal:events.signal});
  document.addEventListener('pointerdown', () => { keyboard = false; }, {capture:true,signal:events.signal});
  const animations = new Set<Animation>();
  const ghosts = new Set<HTMLElement>();
  const selectors = '.factory-control-identity,.factory-room-picker,.factory-context-action,.factory-agents-shortcut,.factory-avatar-shortcut,.factory-focus-title,.window-heading,.window-scroll,.board-heading,#board-navigation > button,#room-navigation > button,.garage-nav > button,.factory-emote-bar > summary';
  const elements = () => [...toolbar.querySelectorAll<HTMLElement>(selectors)].filter(el => !el.closest('[hidden],.factory-toolbar-ghost') && el.getBoundingClientRect().width > 0);
  const key = (el: HTMLElement) => el.matches('.factory-room-picker,.factory-focus-title,.window-heading,.board-heading') ? 'view-title' : el.id || el.className || el;
  function cancel() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
  }
  function animate(el: HTMLElement, frames: Keyframe[], duration = 240, done?: () => void) {
    const animation = el.animate(frames, { duration, easing:'cubic-bezier(.32,.72,0,1)' });
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation); done?.(); };
  }
  return {
    capture(enabled: boolean) {
      if (!enabled || reduced.matches || keyboard) { cancel(); return () => {}; }
      // Capture rendered positions before cancellation, including an interrupted move.
      const oldFrame = toolbar.getBoundingClientRect();
      const before = new Map(elements().map(el => [key(el), {
        rect:el.getBoundingClientRect(), opacity:getComputedStyle(el).opacity,
        content:el.innerHTML, clone:el.cloneNode(true) as HTMLElement,
      }]));
      cancel();
      return () => {
        const frame = toolbar.getBoundingClientRect();
        const after = elements();
        const current = new Map(after.map(el => [key(el), el]));
        const rects = new Map(after.map(el => [el, el.getBoundingClientRect()]));
        if (Math.abs(oldFrame.width-frame.width) > 1) animate(toolbar,
          [{width:`${oldFrame.width}px`},{width:`${frame.width}px`}]);
        for (const el of after) {
          const old = before.get(key(el)), rect = rects.get(el)!;
          const changed = !old || old.content !== el.innerHTML;
          const x = old ? (old.rect.left-oldFrame.left)-(rect.left-frame.left) : 8;
          const y = old ? (old.rect.top-oldFrame.top)-(rect.top-frame.top) : 4;
          if (changed || Math.abs(x) > .5 || Math.abs(y) > .5) animate(el, [
            {transform:`translate(${x}px,${y}px)`,opacity:changed ? 0 : old?.opacity ?? 1},
            {transform:'translate(0,0)',opacity:1},
          ]);
        }
        for (const [id, old] of before) {
          if (current.get(id)?.innerHTML === old.content) continue;
          const ghost = document.createElement('div');
          ghost.className = 'factory-toolbar-actions factory-toolbar-ghost';
          ghost.inert = true; ghost.setAttribute('aria-hidden','true');
          // Visual copies must never duplicate IDs, keyboard targets or live regions.
          for (const node of [old.clone, ...old.clone.querySelectorAll('*')]) {
            node.removeAttribute('id'); node.removeAttribute('aria-live');
          }
          ghost.style.cssText = `left:${old.rect.left-oldFrame.left}px;top:${old.rect.top-oldFrame.top}px;width:${old.rect.width}px;height:${old.rect.height}px`;
          ghost.append(old.clone); toolbar.append(ghost); ghosts.add(ghost);
          animate(ghost,[{opacity:old.opacity,transform:'translateY(0)'},{opacity:0,transform:'translateY(-4px)'}],100,()=>{ghost.remove();ghosts.delete(ghost);});
        }
      };
    },
    dispose() { cancel(); events.abort(); },
  };
}
