import { createProfileMenu } from './factory25dProfileMenu';
import { createEmoteBar } from './factory25dEmoteBar';
import { createToolbarElement } from './factory25dToolbarElement';
import { factoryToolbarState } from './factory25dToolbarState';
import { createToolbarMotion } from './factory25dToolbarMotion';
import { createToolbarTooltip } from './factory25dToolbarTooltip';
import { createRoomMenu } from './factory25dRoomMenu';
import { createProfilePortrait } from './factory25dPortrait';
import { DEFAULT_AVATAR } from '@shared/constants';
import { createDuckHud, type DuckHudModel } from './factory25dDuckHud';
import './factory25dControls.css';
import './factory25dToolbarLab.css';
import './factory25dBasketballChallenge.css';

type Input = Parameters<typeof factoryToolbarState>[0] & {gameActive?:boolean;duck?:'wave'|'cleared'|'failed';boardGame?:boolean;horse?:string;letters?:number;sound?:string;notice?:string};
// Representative duck hunt HUD samples: mid-round, a cleared round and a failed one.
const duckHuds:Record<'wave'|'cleared'|'failed',DuckHudModel>={
  wave:{round:2,shots:2,tally:['hit','hit','miss','hit','pending','pending','pending','pending','pending','pending'],quota:7,message:'wave 3 of 5'},
  cleared:{round:2,shots:3,tally:['hit','hit','miss','hit','hit','hit','miss','hit','hit','miss'],quota:7,message:'round 2 cleared · 7/10'},
  failed:{round:1,shots:3,tally:['hit','miss','miss','hit','miss','hit','miss','miss','hit','miss'],quota:6,message:'round over · 4/10 · needed 6'},
};
const base:Input={connected:true,signedIn:false,owned:0,active:false,pending:false,blocked:false,room:'factory',controlName:'sample agent 1'};
const states:Array<{name:string;note:string;input:Partial<Input>}>= [
  {name:'watching',note:'signed out · connect on the right',input:{}},
  {name:'connected, no agents',note:'avatar editing is available without an active agent',input:{signedIn:true}},
  {name:'your agents are here',note:'open your profile to go to, control or customize',input:{signedIn:true,owned:2}},
  {name:'taking control',note:'a pending request can be canceled',input:{signedIn:true,owned:2,pending:true}},
  {name:'walking',note:'who you control · stop controlling ends manual control',input:{signedIn:true,owned:2,active:true}},
  {name:'patio',note:'outdoor tools and room counts',input:{signedIn:true,owned:2,room:'patio'}},
  {name:'duck hunt round',note:'round, three shells and ten duck marks in the island; the play button becomes a quiet end-round action',input:{signedIn:true,owned:2,room:'patio',duck:'wave'}},
  {name:'tic tac toe',note:'start another game from the whiteboard',input:{signedIn:true,owned:2,focused:'whiteboard',boardGame:true}},
  {name:'garage',note:'room navigation and your profile',input:{signedIn:true,owned:2,room:'garage'}},
  {name:'elevator or driving',note:'room changes pause while the scene is busy',input:{signedIn:true,owned:2,room:'garage',blocked:true}},
  {name:'controlling while driving',note:'stop controlling remains available while driving',input:{signedIn:true,owned:2,room:'garage',active:true,blocked:true}},
  {name:'connection lost',note:'keep your identity visible while reconnecting',input:{signedIn:true,connected:false}},
  ...['window','whiteboard','brand shelf','our people','chat','avatar','close-up'].map(focused=>({name:focused,note:'focused view · back returns to the room',input:{signedIn:true,owned:2,focused,blocked:true}})),
];
states.push(
  ...[
    ['accept game','Incoming HORSE invitation; accept starts the replay.'],
    ['watching opponent shot','Automatic replay; click skips.'],
    ['your turn · 10 ft','Match the marked shot.'],
    ['your turn · choose a spot','Move the ball before setting a shot.'],
    ['confirm challenge','Made shot waits for confirmation at that same spot.'],
    ['sending…','Submission is pending.'],
    ['sent · they shoot from here','Challenge handoff confirmation.'],
    ['waiting for teammate','The other player owns the next turn.'],
    ['shot away','Keep current letters visible during flight.'],
    ['shot made','Successful shot feedback.'],
    ['miss · you take H','A missed match earns a letter.'],
    ['you won','Completed HORSE game.'],
    ['you lost','Five letters ends the game.'],
    ['challenge expired','The invitation or game expired.'],
    ['no opponents','Expanded picker with Cancel.'],
    ['could not send · retry','Connection failure preserves the action.'],
  ].map(([horse,note])=>({name:`HORSE · ${horse}`,note,input:{signedIn:true,owned:2,horse,letters:horse.includes('miss')?1:horse==='you lost'?5:0}})),
  ...['both on','music only','SFX only','muted','volume controls'].map(sound=>({name:`sound · ${sound}`,note:'Local presentation sample; click the waveform to toggle.',input:{signedIn:true,owned:2,sound}})),
  {name:'duck hunt · round cleared',note:'Quota met: the marks stay up for a moment and play offers the next round.',input:{signedIn:true,owned:2,room:'patio',duck:'cleared'}},
  {name:'duck hunt · round failed',note:'Under quota: the result names the quota and play starts over from round one.',input:{signedIn:true,owned:2,room:'patio',duck:'failed'}},
  {name:'DJ station',note:'Focused booth controls; unrelated room targets are disabled.',input:{signedIn:true,focused:'DJ station'}},
  {name:'connection error',note:'Error feedback; retry does not discard identity.',input:{connected:false,signedIn:true,notice:'connection lost · retrying'}},
);
const root=document.querySelector<HTMLElement>('#toolbar-lab')!;
root.className='toolbar-lab';
document.body.classList.add('factory-toolbar-ready');
root.innerHTML='<header><p>fluid factory / interface lab</p><h1>one bar, every state.</h1><p>Sample identity and counts. Shared live toolbar, state rules, menus and styles, with representative game and audio samples. Menu contents open from each room/profile control; the game samples do not run the games. Nothing here connects or sends commands.</p><a href="/prototype-25d-slice.html?controlsPreview=ready">open the interactive room playground ↗</a></header><section class="lab-interactive"><h2>try the transitions</h2><p class="lab-selection"></p><div class="lab-stage"></div><div class="lab-switches" aria-label="Preview state"></div></section><section class="lab-grid" aria-label="All toolbar states"></section>';
const disposers:Array<()=>void>=[];
function dock(host:HTMLElement,id:string) {
  const {toolbar,contextIcons}=createToolbarElement();host.append(toolbar);
  const room=toolbar.querySelector<HTMLButtonElement>('.factory-room-picker')!;
  const controlIdentity=toolbar.querySelector<HTMLElement>('.factory-control-identity')!;
  const action=toolbar.querySelector<HTMLButtonElement>('.factory-context-action')!, avatar=toolbar.querySelector<HTMLButtonElement>('.factory-avatar-shortcut')!;
  const tools=toolbar.querySelector<HTMLElement>('.factory-view-tools')!, title=toolbar.querySelector<HTMLElement>('.factory-focus-title')!;
  avatar.querySelector('.factory-nav-portrait')!.replaceChildren(createProfilePortrait(DEFAULT_AVATAR));
  let input={...base}; const motion=createToolbarMotion(toolbar), tooltip=createToolbarTooltip(toolbar,`tip-${id}`);
  const menu=createRoomMenu(toolbar,room,destination=>update({...input,room:destination,focused:undefined,blocked:false}),`rooms-${id}`);
  const profile=createProfileMenu(toolbar,avatar,{
    edit:()=>update({...input,focused:'avatar',blocked:true}),
    go:agent=>update({...input,room:agent==='sample-1'?'factory':'patio'}),
    control:agent=>update({...input,active:true,pending:false,controlName:agent==='sample-1'?'sample agent 1':'sample agent 2'}),
  },`profile-${id}`);
  const game=document.createElement('button'); game.className='horse-turn'; toolbar.querySelector('.factory-toolbar-actions')!.append(game);
  const sound=document.createElement('button');sound.className='factory-audio-mute';sound.setAttribute('aria-label','Sound');
  sound.innerHTML='<span class="factory-audio-wave" aria-hidden="true">'+Array.from({length:7},()=>'<i></i>').join('')+'</span>'; toolbar.querySelector('.factory-toolbar-actions')!.append(sound);
  const extra=document.createElement('div');extra.className='lab-state-detail';host.append(extra);
  sound.onclick=()=>update({...input,sound:input.sound==='muted'?'both on':'muted'});
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
    }else{avatar.before(controlIdentity);avatar.before(action);if(input.room==='patio'){const duck=input.duck??(input.gameActive?'wave':undefined);tools.innerHTML='<button class="factory-game-action duck-play"></button>';const play=tools.querySelector<HTMLButtonElement>('button')!;
      const icon='<svg class="duck-play-icon" aria-hidden="true" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#f2ac42" d="M2 8h10v5H4v-1H2z"/><path fill="#ffe08a" d="M3 8h5v3H3z"/><path fill="#42865a" d="M9 3h4v1h1v5h-5z"/><path fill="#f6eed3" d="M9 8h5v1H9z"/><path fill="#e3782b" d="M13 5h3v2h-3z"/><path fill="#172a24" d="M11 4h1v1h-1z"/><path fill="#bd642e" d="M5 12h7v1H5z"/></svg>';
      play.innerHTML=duck==='wave'?'end round':`${icon}<span>${duck==='cleared'?'next round':duck==='failed'?'play again':'duck hunt'}</span>`;play.dataset.gameActive=String(duck==='wave');
      play.onclick=()=>update({...input,gameActive:undefined,duck:duck==='wave'?undefined:'wave'});
      if(duck){const hud=document.createElement('span');hud.className='room-view-status';hud.style.display='inline-flex';createDuckHud(hud).paint(duckHuds[duck]);tools.prepend(hud);}}}
    avatar.after(sound);
    if(!input.focused && input.room==='patio') sound.after(tools); else if(!input.focused) room.after(tools);
    if(input.duck==='wave'||input.gameActive){room.hidden=avatar.hidden=true; action.hidden=false; action.setAttribute('aria-label','Back'); action.querySelector('.factory-nav-label')!.textContent='back'; action.querySelector('.factory-nav-icon')!.innerHTML=contextIcons.back; tools.before(action);}
    game.hidden=!input.horse; game.textContent=input.horse??'';
    game.classList.toggle('horse-play', ['accept game','confirm challenge'].includes(input.horse??''));
    game.disabled=['sending…','waiting for teammate'].includes(input.horse??'');
    extra.replaceChildren(); extra.hidden=true;
    if(input.horse?.startsWith('your turn') || input.horse==='shot away' || input.horse?.startsWith('miss')){
      room.hidden=avatar.hidden=true;action.hidden=false;action.setAttribute('aria-label','Back');action.querySelector('.factory-nav-label')!.textContent='back';
      action.querySelector('.factory-nav-icon')!.innerHTML=contextIcons.back;
      const letters=document.createElement('span');letters.className='horse-turn-letters';
      for(const [i,l] of [...'HORSE'].entries()){const cell=document.createElement('span');cell.textContent=l;cell.className=i<(input.letters??0)?'is-earned':'';letters.append(cell);}game.append(letters);
    }
    if(input.horse==='no opponents'){extra.hidden=false;extra.textContent='No opponents available yet.';game.textContent='cancel';game.classList.add('lab-cancel');}else game.classList.remove('lab-cancel');
    if(input.notice){extra.hidden=false;extra.textContent=input.notice;}
    if(input.sound==='volume controls'){
      extra.hidden=false;extra.classList.add('lab-volume-panel');
      for(const name of ['Music','SFX']){const label=document.createElement('label');label.textContent=name;const slider=document.createElement('input');slider.type='range';slider.value='40';slider.setAttribute('aria-label',`${name} volume sample`);label.append(slider);extra.append(label);}
    }else extra.classList.remove('lab-volume-panel');
    sound.setAttribute('aria-pressed',String(input.sound!=='muted'));sound.dataset.tooltip=input.sound??'both on';
    sound.querySelectorAll<HTMLElement>('i').forEach((bar,i)=>{bar.style.height=`${[5,9,13,17,13,9,5][i]}px`;bar.style.background=input.sound==='muted'?'#71837b':i===3?'#36c4ff':'#159be4';});
    menu.update(input.room,{factory:12,patio:4,garage:2},input.connected,model.navigationDisabled);finish();
  }
  action.onclick=()=>{if(input.focused)update({...input,focused:undefined,blocked:false});else if(input.active||input.pending)update({...input,active:false,pending:false});else update({...input,signedIn:true,connected:true});};
  disposers.push(()=>{motion.dispose();tooltip.dispose();menu.dispose();profile.dispose();emotes.dispose();});return update;
}
const live=dock(root.querySelector('.lab-stage')!,'interactive');
const select=(index:number)=>{const state=states[index];live({...base,...state.input});root.querySelector('.lab-selection')!.textContent=state.name;root.querySelectorAll<HTMLButtonElement>('.lab-switches button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));};
states.forEach((state,index)=>{
 const switcher=document.createElement('button');switcher.textContent=state.name;switcher.onclick=()=>select(index);root.querySelector('.lab-switches')!.append(switcher);
 const card=document.createElement('article');card.innerHTML=`<h2>${state.name}</h2><p>${state.note}</p><div class="lab-stage"></div>`;root.querySelector('.lab-grid')!.append(card);dock(card.querySelector('.lab-stage')!,`state-${index}`)({...base,...state.input});
});select(0);
if(import.meta.hot)import.meta.hot.dispose(()=>disposers.forEach(dispose=>dispose()));
