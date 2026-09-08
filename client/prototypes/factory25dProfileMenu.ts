export type ProfileAgentItem = { id:string; name:string; detail:string; controlled?:boolean; pending?:boolean; unavailable?:boolean };
/** A hoverable account panel that also works with click, touch and keyboard. */
export function createProfileMenu(toolbar:HTMLElement, trigger:HTMLButtonElement,
  actions:{go:(id:string)=>void;control:(id:string)=>void;edit:()=>void}, id='factory-profile-menu') {
  const abort=new AbortController(), events={signal:abort.signal};
  const menu=document.createElement('section'); menu.className='factory-profile-menu'; menu.id=id;
  menu.hidden=true; menu.setAttribute('role','dialog'); menu.setAttribute('aria-label','Your agents and avatar');
  menu.innerHTML='<header>your agents</header><div class="factory-profile-list"></div><p class="factory-profile-status" role="status"></p><footer><button type="button" data-profile-action="edit">edit avatar</button></footer>';
  toolbar.append(menu); trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-expanded','false');
  trigger.dataset.tooltip='your agents & avatar';trigger.dataset.profileMenu='true';
  let closeTimer:ReturnType<typeof setTimeout>|undefined,openTimer:ReturnType<typeof setTimeout>|undefined,motion:Animation|undefined,signature='',pinned=false;
  function close(focus=false){pinned=false;clearTimeout(closeTimer);clearTimeout(openTimer);motion?.cancel();menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});}
  function open(keyboard=false){
    clearTimeout(closeTimer);clearTimeout(openTimer);if(trigger.hidden||trigger.disabled)return;
    const wasHidden=menu.hidden;menu.hidden=false;trigger.setAttribute('aria-expanded','true');
    const dock=toolbar.getBoundingClientRect(),button=trigger.getBoundingClientRect();
    menu.style.left=`${Math.max(8-dock.left,Math.min(button.right-menu.offsetWidth-dock.left,innerWidth-menu.offsetWidth-8-dock.left))}px`;
    if(wasHidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches)motion=menu.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:140,easing:'ease-out'});
    if(keyboard)pinned=true;
    if(keyboard)menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }
  const leave=()=>{clearTimeout(openTimer);closeTimer=setTimeout(()=>{if(!pinned&&!menu.contains(document.activeElement))close();},180);};
  trigger.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')openTimer=setTimeout(()=>open(),160);},events);
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
  return {close,update(items:ProfileAgentItem[],connected:boolean,available:boolean,message=''){
    if(trigger.hidden||trigger.disabled)close();
    const next=JSON.stringify([items,connected,available,message]);if(next===signature)return;signature=next;
    const focused=document.activeElement as HTMLElement|null,oldId=focused?.closest<HTMLElement>('[data-agent-id]')?.dataset.agentId,oldAction=focused?.dataset.profileAction;
    const list=menu.querySelector('.factory-profile-list')!;list.replaceChildren();
    for(const item of items){
      const row=document.createElement('article');row.dataset.agentId=item.id;
      const name=document.createElement('strong');name.textContent=item.name;
      const detail=document.createElement('span');detail.textContent=item.detail;
      const buttons=document.createElement('div');
      for(const action of ['go','control']){const button=document.createElement('button');button.type='button';button.dataset.profileAction=action;
        button.textContent=action==='go'?'go to':item.controlled?'controlling':item.pending?'connecting…':item.unavailable?'occupied':'control';
        button.setAttribute('aria-label',`${button.textContent}: ${item.name}`);
        button.disabled=!connected||!available||action==='control'&&(!!item.controlled||!!item.pending||!!item.unavailable);
        buttons.append(button);
      }row.append(name,detail,buttons);list.append(row);
    }
    const status=menu.querySelector<HTMLElement>('.factory-profile-status')!;
    status.textContent=message||(!connected?'reconnecting · actions will return shortly':!items.length?'no active agents right now':!available?'finish your current interaction to move an agent':'');status.hidden=!status.textContent;
    if(oldId&&oldAction&&!menu.hidden){const row=[...list.querySelectorAll<HTMLElement>('article')].find(row=>row.dataset.agentId===oldId);row?.querySelector<HTMLButtonElement>(`button[data-profile-action="${oldAction}"]:not(:disabled)`)?.focus({preventScroll:true});}
  },dispose(){close();observer.disconnect();abort.abort();menu.remove();}};
}
