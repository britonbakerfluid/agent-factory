/** One layout transition owns the shell and row controls across every island state. */
export function createIslandTransitions(toolbar: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = '.factory-toolbar-actions button,.factory-focus-title,.factory-view-tools>div,.horse-turn,.basketball-challenge-picker>summary,.factory-audio-mute';
  type Box = { left:number; top:number; width:number; height:number };
  const boxes = new Map<HTMLElement,Box>();
  const motions = new Map<Element,Animation>();
  let shell:Animation|undefined, frame=0, disposed=false;
  let shellBox = toolbar.getBoundingClientRect();
  const timing = {duration:240,easing:'cubic-bezier(.22,1,.36,1)'};
  const visible = (el:HTMLElement) => el.getBoundingClientRect().width>0 && getComputedStyle(el).visibility!=='hidden' && !el.closest('[hidden]');
  function measure() {
    frame=0; if(disposed)return;
    // Sample the currently rendered positions before removing an interrupted effect.
    const rendered = new Map([...boxes].map(([el,box])=>{
      const transform=motions.get(el)?.playState==='running' ? getComputedStyle(el).transform : 'none';
      const matrix=transform==='none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
      return [el,{left:box.left+matrix.e,top:box.top+matrix.f,width:box.width*matrix.a,height:box.height*matrix.d}] as const;
    }));
    const renderedShellWidth = shell?.playState==='running' ? parseFloat(getComputedStyle(toolbar,'::after').width) : shellBox.width;
    const previousMotions=[...motions.entries()].map(([el,motion])=>({el,motion,time:motion.currentTime,running:motion.playState==='running'}));
    const previousShell=shell, shellTime=shell?.currentTime, shellRunning=shell?.playState==='running';
    for(const motion of motions.values())motion.cancel(); motions.clear(); shell?.cancel();
    const nextShell=toolbar.getBoundingClientRect();
    const controls=[...toolbar.querySelectorAll<HTMLElement>(selector)].filter(el=>visible(el) && !el.closest('.factory-room-menu,.factory-profile-menu'));
    // A parent view group moves as one unit; do not animate its nested buttons twice.
    const items=controls.filter(el=>!controls.some(parent=>parent!==el&&parent.contains(el)));
    const next=new Map(items.map(el=>[el,el.getBoundingClientRect()]));
    const audio = toolbar.querySelector<HTMLElement>('.factory-volume-control');
    if (audio) {
      const edge = audio.getBoundingClientRect().right;
      toolbar.dataset.audioAtEdge = String(![...next].some(([el,rect]) => !audio.contains(el) && rect.left >= edge - .5));
    }
    const unchanged=next.size===boxes.size && Math.abs(nextShell.width-shellBox.width)<.5 && [...next].every(([el,r])=>{const b=boxes.get(el);return b && Math.abs(b.left-r.left)<.5 && Math.abs(b.top-r.top)<.5 && Math.abs(b.width-r.width)<.5;});
    if(unchanged){
      for(const item of previousMotions)if(item.running){item.motion.play();item.motion.currentTime=item.time;motions.set(item.el,item.motion);}
      if(previousShell&&shellRunning){previousShell.play();previousShell.currentTime=shellTime??0;}
      return;
    }
    if(!reduced.matches) {
      if(Math.abs(renderedShellWidth-nextShell.width)>.5) {
        const inset = (nextShell.width-renderedShellWidth)/2;
        const frames = Array.from({length:17},(_,i)=>{ const edge=Math.round(inset*(1-i/16)/2)*2; return {left:`${edge}px`,right:`${edge}px`,transform:'none'}; });
        shell=toolbar.animate(frames,{...timing,pseudoElement:'::after',easing:'steps(16,end)'});
      }
      for(const [el,rect] of next) {
        const old=rendered.get(el)??boxes.get(el);
        if(!old) { motions.set(el,el.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],timing)); continue; }
        const x=old.left-rect.left,y=old.top-rect.top;
        if(Math.abs(x)>.5||Math.abs(y)>.5) {
          // Translate whole controls on the grid; never stretch their corners or artwork.
          const frames=Array.from({length:17},(_,i)=>({transform:`translate(${Math.round(x*(1-i/16)/2)*2}px,${Math.round(y*(1-i/16)/2)*2}px)`}));
          motions.set(el,el.animate(frames,{...timing,easing:'steps(16,end)'}));
        }
      }
    }
    boxes.clear();for(const [el,rect] of next)boxes.set(el,rect);shellBox=nextShell;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  // Attribute changes reflect states, not hover colors or the audio meter's frame updates.
  const changes=new MutationObserver(records=>{
    if(records.some(r=>r.type==='childList'&&!((r.target as Element).closest?.('.factory-audio-wave,.scene-sound,.factory-toolbar-tooltip')) || r.type==='attributes'&&r.oldValue!==(r.target as Element).getAttribute(r.attributeName!)))schedule();
  });
  changes.observe(toolbar,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['hidden','open','data-focus','data-view','data-control']});
  const resize=new ResizeObserver(schedule);resize.observe(toolbar);
  measure();
  return {dispose(){disposed=true;cancelAnimationFrame(frame);changes.disconnect();resize.disconnect();shell?.cancel();for(const motion of motions.values())motion.cancel();}};
}
