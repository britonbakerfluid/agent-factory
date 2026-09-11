import { pixelIcon } from './factory25dPixelIcons';
import type { FactoryRoom } from '@shared/factory25d-layout';

export function createRoomMenu(toolbar: HTMLElement, trigger: HTMLButtonElement, visit: (room: FactoryRoom) => void, id = 'factory-room-menu', onOpen:()=>void=()=>{}) {
  const events = new AbortController(), options = {signal:events.signal};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rooms = {factory:'workspace',patio:'patio',garage:'garage'} as const;
  const icons:Record<FactoryRoom,string>={
    factory:pixelIcon('building'),
    patio:pixelIcon('tree-pine'),
    garage:pixelIcon('home'),
  };
  const menu = document.createElement('div'); menu.className = 'factory-room-menu';
  menu.id = id; menu.hidden = true; menu.setAttribute('role','menu'); menu.setAttribute('aria-label','Rooms');
  menu.innerHTML = '<p class="factory-room-menu-heading">explore the factory</p>';
  const rows = (Object.entries(rooms) as [FactoryRoom,string][]).map(([room,label])=>{
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role','menuitemradio');
    button.innerHTML = `<span class="factory-room-icon" aria-hidden="true">${icons[room]}</span><span class="factory-room-name">${label}</span><span class="factory-room-count"></span><span class="factory-room-check" aria-hidden="true">${pixelIcon('check')}</span>`;
    button.addEventListener('click',()=>{close(true); visit(room);},options);
    menu.append(button); return {room,label,button,count:button.querySelector<HTMLElement>('.factory-room-count')!};
  });
  toolbar.append(menu);
  trigger.setAttribute('aria-haspopup','menu'); trigger.setAttribute('aria-controls',menu.id); trigger.setAttribute('aria-expanded','false');
  let current: FactoryRoom = 'factory', motion: Animation | undefined, signature = '';
  function close(restore = false) {
    motion?.cancel(); menu.hidden = true; trigger.setAttribute('aria-expanded','false');
    if(restore) trigger.focus({preventScroll:true});
  }
  function open(last = false) {
    if(trigger.disabled) return;
    onOpen();
    menu.hidden=false; trigger.setAttribute('aria-expanded','true');
    const dock=toolbar.getBoundingClientRect(), button=trigger.getBoundingClientRect();
    menu.style.left=`${Math.max(8-dock.left,Math.min(button.left-dock.left,innerWidth-menu.offsetWidth-8-dock.left))}px`;
    motion?.cancel();
    if(!reduced.matches) motion=menu.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:140,easing:'cubic-bezier(.23,1,.32,1)'});
    (last ? rows[rows.length - 1].button : rows.find(row=>row.room===current)!.button).focus({preventScroll:true});
  }
  trigger.addEventListener('click',()=>menu.hidden ? open() : close(),options);
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();open(event.key==='ArrowUp');}},options);
  menu.addEventListener('keydown',event=>{
    event.stopPropagation();
    const buttons=rows.map(row=>row.button), index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault(); const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next].focus();
    } else if(event.key==='Tab') close(true);
  },options);
  menu.addEventListener('focusout',event=>{if(event.relatedTarget && !menu.contains(event.relatedTarget as Node) && event.relatedTarget!==trigger)close();},options);
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target as Node)&&!trigger.contains(event.target as Node))close();},options);
  window.addEventListener('resize',()=>close(),options);
  return {
    update(room:FactoryRoom,counts:Record<FactoryRoom,number>,connected:boolean,disabled:boolean) {
      const next=JSON.stringify([room,counts,connected,disabled]); if(next===signature)return; signature=next; current=room;
      trigger.querySelector('.factory-room-label')!.textContent=rooms[room];
      trigger.querySelector('.factory-nav-icon')!.innerHTML=icons[room];
      trigger.setAttribute('aria-label',`Current room: ${rooms[room]}. Choose a room`);
      if(disabled) close();
      for(const row of rows){
        row.button.setAttribute('aria-checked',String(row.room===room));
        row.count.textContent=connected ? `${counts[row.room]} ${counts[row.room]===1?'agent':'agents'}` : 'offline';
        row.button.setAttribute('aria-label',`${row.label}, ${row.count.textContent}`);
      }
    },
    close,
    dispose(){close();events.abort();menu.remove();},
  };
}
