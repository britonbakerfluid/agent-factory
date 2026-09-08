import { createProfileMenu } from './factory25dProfileMenu';
import { createEmoteBar } from './factory25dEmoteBar';
import { createToolbarElement } from './factory25dToolbarElement';
import { factoryToolbarState } from './factory25dToolbarState';
import { createToolbarMotion } from './factory25dToolbarMotion';
import { createToolbarTooltip } from './factory25dToolbarTooltip';
import { createRoomMenu } from './factory25dRoomMenu';
import { createProfilePortrait } from './factory25dPortrait';
import { DEFAULT_AVATAR } from '@shared/constants';
import './factory25dControls.css';
import './factory25dToolbarLab.css';

type Input = Parameters<typeof factoryToolbarState>[0] & {gameActive?:boolean;boardGame?:boolean};
const base:Input={connected:true,signedIn:false,owned:0,active:false,pending:false,blocked:false,room:'factory',controlName:'sample agent 1'};
const states:Array<{name:string;note:string;input:Partial<Input>}>= [
  {name:'watching',note:'signed out · connect on the right',input:{}},
  {name:'connected, no agents',note:'avatar editing is available without an active agent',input:{signedIn:true}},
  {name:'your agents are here',note:'open your profile to go to, control or customize',input:{signedIn:true,owned:2}},
  {name:'taking control',note:'a pending request can be canceled',input:{signedIn:true,owned:2,pending:true}},
  {name:'walking',note:'who you control · stop controlling ends manual control',input:{signedIn:true,owned:2,active:true}},
  {name:'patio',note:'outdoor tools and room counts',input:{signedIn:true,owned:2,room:'patio'}},
  {name:'duck hunt round',note:'the bright play button becomes a quiet end-round action',input:{signedIn:true,owned:2,room:'patio',gameActive:true}},
  {name:'tic tac toe',note:'start another game from the whiteboard',input:{signedIn:true,owned:2,focused:'whiteboard',boardGame:true}},
  {name:'garage',note:'room navigation and your profile',input:{signedIn:true,owned:2,room:'garage'}},
  {name:'elevator or driving',note:'room changes pause while the scene is busy',input:{signedIn:true,owned:2,room:'garage',blocked:true}},
  {name:'controlling while driving',note:'stop controlling remains available while driving',input:{signedIn:true,owned:2,room:'garage',active:true,blocked:true}},
  {name:'connection lost',note:'keep your identity visible while reconnecting',input:{signedIn:true,connected:false}},
  ...['window','whiteboard','brand shelf','our people','chat','avatar','close-up'].map(focused=>({name:focused,note:'focused view · back returns to the room',input:{signedIn:true,owned:2,focused,blocked:true}})),
];
const root=document.querySelector<HTMLElement>('#toolbar-lab')!;
root.className='toolbar-lab';
document.body.classList.add('factory-toolbar-ready');
root.innerHTML='<header><p>fluid factory / interface lab</p><h1>one bar, every state.</h1><p>Sample identity and counts. These are the same toolbar elements, state rules, menus and styles used in the factory. Nothing here connects or sends commands.</p><a href="/prototype-25d-slice.html?controlsPreview=ready">open the interactive room playground ↗</a></header><section class="lab-interactive"><h2>try the transitions</h2><p class="lab-selection"></p><div class="lab-stage"></div><div class="lab-switches" aria-label="Preview state"></div></section><section class="lab-grid" aria-label="All toolbar states"></section>';
const disposers:Array<()=>void>=[];
function dock(host:HTMLElement,id:string) {
  const {toolbar,contextIcons}=createToolbarElement();host.append(toolbar);
  const room=toolbar.querySelector<HTMLButtonElement>('.factory-room-picker')!, agents=toolbar.querySelector<HTMLButtonElement>('.factory-agents-shortcut')!;
  const controlIdentity=toolbar.querySelector<HTMLElement>('.factory-control-identity')!;
  const action=toolbar.querySelector<HTMLButtonElement>('.factory-context-action')!, avatar=toolbar.querySelector<HTMLButtonElement>('.factory-avatar-shortcut')!;
  const tools=toolbar.querySelector<HTMLElement>('.factory-view-tools')!, title=toolbar.querySelector<HTMLElement>('.factory-focus-title')!;
  agents.removeAttribute('aria-controls'); agents.querySelector('.factory-nav-label')!.textContent='your agents';
  avatar.querySelector('.factory-nav-portrait')!.replaceChildren(createProfilePortrait(DEFAULT_AVATAR));
  let input={...base}; const motion=createToolbarMotion(toolbar), tooltip=createToolbarTooltip(toolbar,`tip-${id}`);
  const menu=createRoomMenu(toolbar,room,destination=>update({...input,room:destination,focused:undefined,blocked:false}),agents,`rooms-${id}`);
  const profile=createProfileMenu(toolbar,avatar,{
    edit:()=>update({...input,focused:'avatar',blocked:true}),
    go:agent=>update({...input,room:agent==='sample-1'?'factory':'patio'}),
    control:agent=>update({...input,active:true,pending:false,controlName:agent==='sample-1'?'sample agent 1':'sample agent 2'}),
  },`profile-${id}`);
  const emotes=createEmoteBar(()=>{},()=>{}); action.before(emotes.element);
  let initialized=false;
  function update(next:Input) {
    const finish=motion.capture(initialized); initialized=true; input=next;
    emotes.sync(input.active,!input.focused&&!input.blocked);
    const model=factoryToolbarState(input); toolbar.dataset.view=model.view; toolbar.dataset.identity=model.identity;toolbar.dataset.control=model.controlMode;toolbar.dataset.reconnecting=String(model.reconnecting);
    controlIdentity.hidden=!model.controlStatus;
    controlIdentity.querySelector('.factory-control-caption')!.textContent=model.controlStatus;
    controlIdentity.querySelector('.factory-control-name')!.textContent=model.controlName;
    controlIdentity.setAttribute('aria-label',`${model.controlStatus} ${model.controlName}`);
    room.hidden=!model.showRoomTools;room.disabled=model.navigationDisabled;
    avatar.hidden=!model.showProfile;avatar.disabled=model.navigationDisabled;
    action.hidden=!model.showPrimary;avatar.setAttribute('aria-label',model.profileLabel);
    profile.update(Array.from({length:input.owned},(_,i)=>({id:`sample-${i+1}`,name:`sample agent ${i+1}`,detail:`${i?'patio':'workspace'} · ${i?'reading':'writing'}`,controlled:input.active&&model.controlName===`sample agent ${i+1}`,pending:input.pending&&i===0})),input.connected,!input.blocked);
    action.setAttribute('aria-busy',String(model.action==='reconnect'));action.dataset.action=model.action;action.disabled=model.primaryDisabled;action.setAttribute('aria-label',model.label);
    action.dataset.tooltip=model.action==='connect'?'connect this browser':model.label;
    action.querySelector('.factory-nav-label')!.textContent=model.label;
    action.querySelector('.factory-nav-icon')!.innerHTML=contextIcons[model.action==='release'||model.action==='cancel'?'stop':model.action==='customize'?'help':model.action];
    tools.replaceChildren();tools.hidden=false;title.hidden=true;
    if(input.focused){tools.before(action);title.textContent=input.focused==='window'?'the valley':input.focused;title.hidden=false;
      if(input.focused==='window'){title.hidden=true;tools.innerHTML='<div class="window-heading"><span class="room-view-title">the valley</span></div><div class="window-scroll"><button aria-label="Look left">←</button><input class="factory-window-position" type="range" aria-label="Window position" value="50"><button aria-label="Look right">→</button></div>';const slider=tools.querySelector('input')!;tools.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>{slider.value=String(+slider.value+(i?10:-10));});}
      if(input.focused==='whiteboard'){title.hidden=true;tools.innerHTML=input.boardGame?'<div class="board-heading"><span class="room-view-title">tic tac toe</span></div><button class="factory-game-action">new game</button>':'<div class="board-heading"><span class="room-view-title">room pulse</span></div><button>↻ leaderboard</button><button>more notes</button>';}
    }else{avatar.before(controlIdentity);avatar.before(action);if(input.room==='patio'){tools.innerHTML='<button class="factory-game-action"></button>';const play=tools.querySelector<HTMLButtonElement>('button')!;play.textContent=input.gameActive?'end round':'duck hunt';play.dataset.gameActive=String(!!input.gameActive);play.onclick=()=>update({...input,gameActive:!input.gameActive});}}
    menu.update(input.room,{factory:12,patio:4,garage:2},input.connected,model.navigationDisabled);finish();
  }
  action.onclick=()=>{if(input.focused)update({...input,focused:undefined,blocked:false});else if(input.active||input.pending)update({...input,active:false,pending:false});else update({...input,signedIn:true,connected:true});};
  agents.onclick=()=>{menu.close();update({...input,signedIn:true,owned:2});};
  disposers.push(()=>{motion.dispose();tooltip.dispose();menu.dispose();profile.dispose();emotes.dispose();});return update;
}
const live=dock(root.querySelector('.lab-stage')!,'interactive');
const select=(index:number)=>{const state=states[index];live({...base,...state.input});root.querySelector('.lab-selection')!.textContent=state.name;root.querySelectorAll<HTMLButtonElement>('.lab-switches button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));};
states.forEach((state,index)=>{
 const switcher=document.createElement('button');switcher.textContent=state.name;switcher.onclick=()=>select(index);root.querySelector('.lab-switches')!.append(switcher);
 const card=document.createElement('article');card.innerHTML=`<h2>${state.name}</h2><p>${state.note}</p><div class="lab-stage"></div>`;root.querySelector('.lab-grid')!.append(card);dock(card.querySelector('.lab-stage')!,`state-${index}`)({...base,...state.input});
});select(0);
if(import.meta.hot)import.meta.hot.dispose(()=>disposers.forEach(dispose=>dispose()));
