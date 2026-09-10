export type ProfileAgentItem = { id:string; name:string; detail:string; controlled?:boolean; pending?:boolean; unavailable?:boolean };
/** A hoverable account panel that also works with click, touch and keyboard. */
export function createProfileMenu(toolbar:HTMLElement, trigger:HTMLButtonElement,
  actions:{go:(id:string)=>void;control:(id:string)=>void;edit:()=>void;open?:()=>void;preview?:(id:string,canvas:HTMLCanvasElement)=>void}, id='factory-profile-menu') {
  const abort=new AbortController(), events={signal:abort.signal};
  const menu=document.createElement('section'); menu.className='factory-profile-menu'; menu.id=id;
  menu.hidden=true; menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','Your agents and avatar');
  menu.innerHTML='<header><span>your agents</span><button type="button" data-profile-action="edit" data-icon-only="true" aria-label="Edit avatar" title="Edit avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 8-5.7M14 20l3.5-1 5-5-2.5-2.5-5 5L14 20Z"/></svg></button></header><div class="factory-profile-list"></div><p class="factory-profile-status" role="status"></p>';
  toolbar.append(menu); trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-expanded','false');
  trigger.dataset.tooltip='your agents & avatar';trigger.dataset.profileMenu='true';
  let closeTimer:ReturnType<typeof setTimeout>|undefined,openTimer:ReturnType<typeof setTimeout>|undefined,motion:Animation|undefined,signature='',pinned=false;
  function close(focus=false){pinned=false;clearTimeout(closeTimer);clearTimeout(openTimer);motion?.cancel();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}
  function open(keyboard=false){
    clearTimeout(closeTimer);clearTimeout(openTimer);if(trigger.hidden||trigger.disabled)return;
    actions.open?.();
    const wasHidden=menu.hidden;menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    const dock=toolbar.getBoundingClientRect(),button=trigger.getBoundingClientRect();
    menu.style.left=`${Math.max(8-dock.left,Math.min(button.right-menu.offsetWidth-dock.left,innerWidth-menu.offsetWidth-8-dock.left))}px`;
    if(wasHidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)motion=menu.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:140,easing:'ease-out'});
    if(keyboard)pinned=true;
    if(keyboard)menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }
  // One continuous hover region includes the gap, including a clamped card on narrow screens.
  let pointer: {x:number;y:number}|undefined;
  function inHoverRegion() {
    if(!pointer)return false;
    const a=trigger.getBoundingClientRect(),b=menu.getBoundingClientRect();
    const within=(r:DOMRect)=>pointer!.x>=r.left&&pointer!.x<=r.right&&pointer!.y>=r.top&&pointer!.y<=r.bottom;
    return within(a)||within(b)||(pointer.y>=b.bottom-6&&pointer.y<=a.top+6&&pointer.x>=Math.min(a.left,b.left)-6&&pointer.x<=Math.max(a.right,b.right)+6);
  }
  const leave=()=>{clearTimeout(openTimer);clearTimeout(closeTimer);closeTimer=setTimeout(()=>{if(!pinned&&!inHoverRegion()&&!menu.contains(document.activeElement))close();},250);};
  document.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;
    pointer={x:e.clientX,y:e.clientY};
    if(menu.hidden||pinned)return;
    if(inHoverRegion())clearTimeout(closeTimer);else leave();
  },events);
  trigger.addEventListener('pointerenter',e=>{clearTimeout(closeTimer);if(e.pointerType==='mouse'){pointer={x:e.clientX,y:e.clientY};clearTimeout(openTimer);openTimer=setTimeout(()=>open(),160);}},events);
  trigger.addEventListener('pointerleave',leave,events);menu.addEventListener('pointerenter',()=>clearTimeout(closeTimer),events);menu.addEventListener('pointerleave',leave,events);
  trigger.addEventListener('click',()=>menu.hidden||!pinned?open(true):close(),events);
  trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();open(true);}},events);
  menu.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close(true);}},events);
  menu.addEventListener('focusout',e=>{if(e.relatedTarget&&!menu.contains(e.relatedTarget as Node)&&e.relatedTarget!==trigger)close();},events);
  menu.addEventListener('click',e=>{
    const button=e.target instanceof Element?e.target.closest<HTMLButtonElement>('button[data-profile-action]'):null;if(!button||button.disabled)return;
    const action=button.dataset.profileAction,agent=button.closest<HTMLElement>('[data-agent-id]')?.dataset.agentId;
    close();if(action==='edit')actions.edit();else if(agent){if(action==='go')actions.go(agent);else actions.control(agent);}
  },events);
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target as Node)&&!trigger.contains(e.target as Node))close();},events);
  window.addEventListener('resize',()=>close(),events);
  const observer=new MutationObserver(()=>{if(trigger.hidden||trigger.disabled)close();});
  observer.observe(trigger,{attributes:true,attributeFilter:['hidden','disabled']});
  let nextPreview=0;
  function render(now:number){if(menu.hidden||now<nextPreview)return;nextPreview=now+120;for(const row of menu.querySelectorAll<HTMLElement>('article[data-agent-id]')){const canvas=row.querySelector('canvas');if(canvas)actions.preview?.(row.dataset.agentId!,canvas);}}
  return {close,render,update(items:ProfileAgentItem[],connected:boolean,available:boolean,message=''){
    if(trigger.hidden||trigger.disabled)close();
    const next=JSON.stringify([items,connected,available,message]);if(next===signature)return;signature=next;
    const focused=document.activeElement as HTMLElement|null,oldId=focused?.closest<HTMLElement>('[data-agent-id]')?.dataset.agentId,oldAction=focused?.dataset.profileAction;
    const list=menu.querySelector('.factory-profile-list')!;list.replaceChildren();
    for(const item of items){
      const row=document.createElement('article');row.dataset.agentId=item.id;
      const preview=document.createElement('canvas');preview.width=preview.height=32;preview.className='factory-profile-agent-preview';preview.setAttribute('aria-hidden','true');
      const identity=document.createElement('div');identity.className='factory-profile-agent-identity';
      const name=document.createElement('strong');name.textContent=item.name;
      const detail=document.createElement('span');detail.textContent=item.detail;
      const buttons=document.createElement('div');buttons.className='factory-profile-agent-actions';
      for(const action of ['go','control']){const button=document.createElement('button');button.type='button';button.dataset.profileAction=action;
        button.textContent=action==='go'?'go to':item.controlled?'controlling':item.pending?'connecting…':item.unavailable?'occupied':'control';
        button.setAttribute('aria-label',`${button.textContent}: ${item.name}`);
        button.title=button.getAttribute('aria-label')!;
        if(action==='go'){
          button.title=`Go to ${item.name}`;
          button.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>';
        }
        if(action==='control'&&!item.controlled&&!item.pending&&!item.unavailable){
          button.dataset.iconOnly='true';
          button.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 6h10c2 0 3 1.5 3.5 4l1 6c.5 3-2 4-3.5 2l-2-3H8l-2 3c-1.5 2-4 1-3.5-2l1-6C4 7.5 5 6 7 6Z"/><path d="M7.5 9v5M5 11.5h5"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12.5" r="1" fill="currentColor" stroke="none"/></svg>';
        }
        button.disabled=!connected||!available||action==='control'&&(!!item.controlled||!!item.pending||!!item.unavailable);
        buttons.append(button);
      }identity.append(name,detail);row.append(preview,identity,buttons);list.append(row);actions.preview?.(item.id,preview);
    }
    const status=menu.querySelector<HTMLElement>('.factory-profile-status')!;
    status.textContent=message||(!connected?'reconnecting · actions will return shortly':!items.length?'no active agents right now':!available?'finish your current interaction to move an agent':'');status.hidden=!status.textContent;
    if(oldId&&oldAction&&!menu.hidden){const row=[...list.querySelectorAll<HTMLElement>('article')].find(row=>row.dataset.agentId===oldId);row?.querySelector<HTMLButtonElement>(`button[data-profile-action="${oldAction}"]:not(:disabled)`)?.focus({preventScroll:true});}
  },dispose(){close();observer.disconnect();abort.abort();menu.remove();}};
}
