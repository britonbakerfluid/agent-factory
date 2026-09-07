import { CONTROL_MOVE_SPEED, DEFAULT_AVATAR, VALID_EMOTES } from '@shared/constants';
import { constrainFactoryStep, toFactoryWorld, fromFactoryWorld, factoryRoomAt, FACTORY_ELEVATOR, GARAGE_ELEVATOR, WORKSTATIONS, factory25dWaypoints, MINI_WORKSTATION_SLOT, MINI_WORKSTATION_USERNAME } from '@shared/factory25d-layout';
import { manualElevatorEntry, manualElevatorLanding, MANUAL_ELEVATOR_DURATION_MS } from '@shared/factory25d-manual-travel';
import { slotPosition, routeDistance, positionAt, zoneForActivity, WORLD_LAYOUTS } from '@shared/world-layouts';
import { garageCarLookout, GARAGE_CAR_VISIT_MS, isGarageCarId } from '@shared/factory25d-garage';
import type { AvatarConfig, ControlInputState, WorldAgent, WorldSnapshot, WSMessageToClient, WSMessageToServer } from '@shared/types';
import { boardDataFromSnapshot, type BoardData } from './factory25dBoardData';
import { activityForVisualState, type AgentVisualState } from './factory25dAgentStates';
import { createAgentStateEditor } from './factory25dStateEditor';
import './factory25dControlPreview.css';

const SCENARIOS = ['watching', 'connecting', 'empty', 'ready', 'activity', 'travel', 'arrival', 'legacy-arrival', 'garage', 'mini-laptop', 'claiming', 'controlling', 'reconnecting', 'expired', 'error'] as const;
type Scenario = typeof SCENARIOS[number];
const emptyInput = (): ControlInputState => ({ up: false, down: false, left: false, right: false });

/** Development-only in-memory transport. No sockets, login, hooks or server writes. */
export function createControlPreview(publish: (data: BoardData) => void,
  receive: (message: WSMessageToClient) => void, connection: (connected: boolean) => void,
  scenarioChanged: (scenario: Scenario, data: BoardData) => void) {
  const tools = document.createElement('details'); tools.className = 'factory-preview-tools pixel-island';
  const mobile = window.matchMedia('(max-width: 600px)'); tools.open = !mobile.matches;
  tools.setAttribute('aria-label', 'Local control preview');
  tools.innerHTML = '<summary>local playground</summary><p>sample agents · nothing is sent live</p><label>jump to a state <select aria-label="Preview control state"></select></label><p class="preview-current" role="status"></p><div class="preview-actions"><button class="preview-reset">reset</button><button class="preview-finish">finish connecting</button></div><div class="preview-actions preview-mini-actions" hidden><button class="preview-mini-start" aria-label="start working">start working</button><button class="preview-mini-pack" aria-label="pack up">pack up</button></div><div class="preview-actions preview-travel-actions" hidden><button class="preview-by-elevator">by elevator</button><button class="preview-by-patio">by patio door</button><button class="preview-by-snacks">by snacks</button></div><div class="preview-activity" hidden></div><a href="?">leave playground ↗</a>';
  const picker = tools.querySelector('select')!, finish = tools.querySelector<HTMLButtonElement>('.preview-finish')!;
  const miniActions = tools.querySelector<HTMLElement>('.preview-mini-actions')!;
  const travelActions = tools.querySelector<HTMLElement>('.preview-travel-actions')!;
  const miniStart = tools.querySelector<HTMLButtonElement>('.preview-mini-start')!, miniPack = tools.querySelector<HTMLButtonElement>('.preview-mini-pack')!;
  const phoneMessage = document.createElement('button'); phoneMessage.type = 'button';
  phoneMessage.className = 'preview-phone-message'; phoneMessage.textContent = 'receive sample message';
  phoneMessage.title = 'A local teammate message; nothing is sent to the factory';
  const phoneActions = document.createElement('div'); phoneActions.className = 'preview-actions'; phoneActions.append(phoneMessage);
  tools.append(phoneActions);
  for (const scenario of SCENARIOS) picker.add(new Option(scenario === 'empty' ? 'connected · no agents' : scenario === 'error' ? 'claim denied' : scenario === 'mini-laptop' ? 'mini laptop' : scenario === 'activity' ? 'agent states' : scenario, scenario));
  document.body.append(tools);
  const controlPanel = document.querySelector<HTMLElement>('.factory-controls')!;
  const observer = new MutationObserver(() => {
    tools.querySelector('.preview-current')!.textContent = `now · ${controlPanel.dataset.state}`;
  });
  observer.observe(controlPanel, { attributes: true, attributeFilter: ['data-state'] });
  const previewHelp = document.createElement('p');
  previewHelp.textContent = 'in this playground, use “finish connecting” above. no terminal needed.';
  controlPanel.querySelector('.factory-connect-guide')!.append(previewHelp);
  const abort = new AbortController(), events = { signal: abort.signal };
  mobile.addEventListener('change', event => { tools.open = !event.matches; }, events);
  let scenario: Scenario = 'watching', epoch = 0, selected: string | undefined;
  let phoneSample = 0;
  let input = emptyInput(), world: WorldSnapshot, elevatorArmed = true;
  const carHomes = new Map<string, WorldAgent['world']>();
  const actionRevision = new Map<string, number>();
  const activityPanel = tools.querySelector<HTMLElement>('.preview-activity')!;
  const stateEditor = createAgentStateEditor(state => {
    if (scenario !== 'activity') return;
    applyActivityState(state); update();
  }, () => { if (scenario === 'activity') update(); });
  activityPanel.append(stateEditor.element);
  let look: AvatarConfig = { ...DEFAULT_AVATAR };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, delay = 700) {
    const generation = epoch;
    const timer = setTimeout(() => { timers.delete(timer); if (generation === epoch) fn(); }, delay); timers.add(timer);
  }
  function connected() { return scenario !== 'reconnecting'; }
  function authenticated() { return !['watching', 'connecting', 'expired'].includes(scenario) && connected(); }
  function data(): BoardData {
    return { ...boardDataFromSnapshot(world), connected: connected(), world,
      canChat: authenticated(), principal: authenticated() ? { ownerId: 'preview-owner', username: 'you · preview' } : undefined };
  }
  function update() {
    world = { ...world, revision: world.revision + 1, serverTime: Date.now(), agents: [...world.agents] };
    const miniWork=world.agents.find(agent => agent.sessionId === 'preview-mine')?.world.miniWork;
    miniPack.disabled = !miniWork || miniWork.packingAt !== undefined;
    phoneMessage.disabled = !connected();
    publish(data());
  }
  phoneMessage.addEventListener('click', () => {
    if (!connected()) return;
    // The in-memory playground usually publishes snapshots only. Bracket this
    // sample with a silent baseline and an actual append event, exactly as the
    // phone's live listener expects; no socket or chat-send command is involved.
    receive({ type: 'world_snapshot', snapshot: world });
    const previousRevision = world.revision;
    const chat = { username: 'teammate · preview', message: `hey, meet you in the lounge · ${++phoneSample}`, timestamp: Date.now() };
    world = { ...world, chat: [...world.chat, chat].slice(-100) }; update();
    receive({ type: 'world_delta', delta: { previousRevision, revision: world.revision, serverTime: world.serverTime,
      changes: [{ kind: 'chat_append', chat }] } });
  }, events);
  function currentPosition(agent: WorldAgent) {
    return agent.manualControl?.elevatorTrip ? manualElevatorLanding(agent.manualControl.elevatorTrip, Date.now())
      : agent.world.movement ? positionAt(agent.world.movement, Date.now()) : agent.world.position;
  }
  function settleElevator(agent: WorldAgent) {
    if (!agent.manualControl?.elevatorTrip) return;
    const position = manualElevatorLanding(agent.manualControl.elevatorTrip, Date.now());
    agent.world = {zone:'manual',position,facing:'down'};
    agent.manualControl = {...position,facing:'down',moving:false};
  }
  function clearMiniControl(agent: WorldAgent) {
    actionRevision.set(agent.sessionId,(actionRevision.get(agent.sessionId)??0)+1);
    settleElevator(agent);
    if (selected === agent.sessionId) {
      selected = undefined; input = emptyInput();
      receive({type:'control_revoked',sessionId:agent.sessionId,reason:'The local work demonstration took over.'});
    }
    delete agent.manualControl; carHomes.delete(agent.sessionId);
  }
  function startMiniWork(agent: WorldAgent, immediate = false) {
    clearMiniControl(agent);
    const now = Date.now(), to = slotPosition('factory25d','work',MINI_WORKSTATION_SLOT);
    const from = immediate ? to : currentPosition(agent), waypoints = factory25dWaypoints(from,to);
    const duration = routeDistance(from,waypoints,to) / 80 * 1000, arrivesAt = now + duration;
    agent.activity = 'reading'; agent.currentTool = 'Read'; agent.lastEventAt = now;
    agent.world = {zone:'work',slotIndex:MINI_WORKSTATION_SLOT,position:from,facing:'up',miniWork:{startedAt:arrivesAt+1000},
      ...(duration > 1 ? {movement:{from,to,waypoints,startedAt:now,arrivesAt}} : {})};
  }
  function miniDemoAgent() { return scenario === 'mini-laptop' ? world.agents.find(agent => agent.sessionId === 'preview-mine' && agent.username === MINI_WORKSTATION_USERNAME) : undefined; }
  miniStart.addEventListener('click', () => { const agent=miniDemoAgent(); if(agent) { startMiniWork(agent); update(); } }, events);
  miniPack.addEventListener('click', () => {
    const agent=miniDemoAgent(); if(!agent?.world.miniWork || agent.world.miniWork.packingAt !== undefined) return;
    clearMiniControl(agent);
    const now=Date.now(),from=currentPosition(agent),to=toFactoryWorld({x:2.2,z:28.1}),waypoints=factory25dWaypoints(from,to);
    agent.activity='idle';agent.currentTool=null;agent.lastEventAt=now;
    // The shared visual packs up first; a future movement clock keeps the avatar still until it finishes.
    const startedAt=now+4500;
    agent.world={zone:'idle',position:from,facing:'up',miniWork:{...agent.world.miniWork,packingAt:now},movement:{from,to,waypoints,startedAt,arrivesAt:startedAt+routeDistance(from,waypoints,to)/80*1000}};
    update();
  }, events);
  function placeTravelAgent(entrance: 'elevator' | 'patio' | 'snacks') {
    if (scenario !== 'travel') return;
    const agent = world.agents.find(agent => agent.sessionId === (selected ?? 'preview-mine'));
    if (!agent || agent.ownerId !== 'preview-owner') return;
    const downstairs = factoryRoomAt(fromFactoryWorld(currentPosition(agent))) === 'garage';
    const position = toFactoryWorld(entrance === 'snacks' ? {x:-2.3,z:9.3} : entrance === 'patio' ? {x:7.3,z:-2.5} : downstairs ? GARAGE_ELEVATOR : FACTORY_ELEVATOR);
    actionRevision.set(agent.sessionId,(actionRevision.get(agent.sessionId)??0)+1);
    carHomes.delete(agent.sessionId); input = emptyInput(); elevatorArmed = true;
    agent.activity = 'idle'; agent.currentTool = null; delete agent.attention;
    agent.world = {zone:selected === agent.sessionId ? 'manual' : 'idle',position,facing:entrance !== 'elevator' ? 'right' : 'up'};
    if (selected === agent.sessionId) agent.manualControl = {...position,facing:agent.world.facing,moving:false};
    else delete agent.manualControl;
    update();
  }
  tools.querySelector('.preview-by-elevator')!.addEventListener('click', () => placeTravelAgent('elevator'), events);
  tools.querySelector('.preview-by-patio')!.addEventListener('click', () => placeTravelAgent('patio'), events);
  tools.querySelector('.preview-by-snacks')!.addEventListener('click', () => placeTravelAgent('snacks'), events);
  function sample(id: string, slot: number, mine: boolean): WorldAgent {
    const position = slotPosition('factory25d', 'work', slot);
    return { sessionId: id, sessionName: mine ? slot === 1 ? 'your agent · preview' : 'patio agent · preview' : 'teammate · preview',
      username: mine ? 'you · preview' : 'teammate · preview', ownerId: mine ? 'preview-owner' : 'preview-teammate',
      avatar: mine ? { ...look } : { ...DEFAULT_AVATAR, color: '#cf945f', shirtColor: '#cf945f', hairStyle: 2 },
      cwd: '/local-playground', activity: 'reading', currentTool: null, subagents: [], startedAt: Date.now(), lastEventAt: Date.now(),
      world: { zone: 'work', slotIndex: slot, position, facing: 'down' } };
  }
  function applyActivityState(state: AgentVisualState) {
    const agent = world.agents.find(item => item.sessionId === 'preview-mine'); if (!agent) return;
    clearMiniControl(agent);
    const now = Date.now();
    const tools: Partial<Record<AgentVisualState, string>> = { reading: 'Read', writing: 'Edit', running: 'Bash', searching: 'Grep', chatting: 'Agent', planning: 'EnterPlanMode', input: 'AskUserQuestion', permission: 'ExitPlanMode' };
    agent.activity = activityForVisualState(state); agent.currentTool = tools[state] ?? null; agent.lastEventAt = now;
    delete agent.attention;
    if (state === 'input' || state === 'permission' || state === 'ready' || state === 'error') agent.attention = {kind:state,since:now};
    agent.sessionName = 'state sample · preview';
    agent.world = {zone:zoneForActivity(agent.activity),slotIndex:1,position:slotPosition('factory25d','work',1),facing:'up'};
  }
  function reset(next: Scenario) {
    epoch++; for (const timer of timers) clearTimeout(timer); timers.clear();
    stateEditor.stop();
    selected = undefined; input = emptyInput(); elevatorArmed = true; scenario = next; picker.value = next; carHomes.clear(); actionRevision.clear();
    finish.hidden = next !== 'connecting';
    miniActions.hidden = next !== 'mini-laptop';
    travelActions.hidden = next !== 'travel';
    activityPanel.hidden = next !== 'activity';
    world = { schemaVersion: 1, revision: 1, serverTime: Date.now(), environment: 'factory25d', workstationCount: WORKSTATIONS.length, garageCars:true,
      agents: [sample('preview-teammate', 4, false), ...(next === 'empty' ? [] : [sample('preview-mine', 1, true), sample('preview-patio', 2, true)])],
      tombstones: [], chat: [], events: [] };
    if (next === 'activity') {
      world.agents = [sample('preview-mine',1,true)]; applyActivityState(stateEditor.state);
    }
    if (next === 'travel') {
      const agent = sample('preview-mine',1,true);
      agent.activity = 'idle'; agent.sessionName = 'walking agent · preview';
      agent.world = {zone:'idle',position:toFactoryWorld(FACTORY_ELEVATOR),facing:'up'};
      world.agents = [agent];
    }
    if (next === 'garage') {
      const agent = world.agents.find(agent => agent.sessionId === 'preview-mine')!;
      agent.activity = 'idle'; agent.world = {zone:'idle',position:toFactoryWorld(garageCarLookout('mini')),facing:'up'};
    }
    if (next === 'mini-laptop') {
      const agent = world.agents.find(agent => agent.sessionId === 'preview-mine')!;
      agent.sessionName = 'Jonathan · preview'; agent.username = MINI_WORKSTATION_USERNAME;
      startMiniWork(agent,true);
    }
    if (next === 'arrival' || next === 'legacy-arrival') {
      const agent = world.agents.find(agent => agent.sessionId === 'preview-mine')!;
      const from = next === 'legacy-arrival' ? toFactoryWorld({ x: 6.7, z: 12.8 }) : WORLD_LAYOUTS.factory25d.entrance;
      const to = agent.world.position, waypoints = factory25dWaypoints(from, to), startedAt = Date.now() + 2_000;
      agent.sessionName = 'arriving · preview';
      agent.world = { ...agent.world, position: from,
        movement: { from, to, waypoints, startedAt, arrivesAt: startedAt + routeDistance(from, waypoints, to) / 80 * 1000 } };
    }
    connection(connected()); update(); scenarioChanged(next, data());
    const panel = document.querySelector<HTMLDetailsElement>('.factory-controls'); if (panel) panel.open = next !== 'activity';
  }
  picker.addEventListener('change', () => reset(picker.value as Scenario), events);
  tools.querySelector('.preview-reset')!.addEventListener('click', () => reset(scenario), events);
  finish.addEventListener('click', () => reset('ready'), events);
  const start = new URLSearchParams(location.search).get('controlsPreview');
  later(() => reset(SCENARIOS.includes(start as Scenario) ? start as Scenario : 'watching'), 0);
  let lastTick = Date.now();
  const tick = setInterval(() => {
    const now = Date.now(), dt = Math.min((now - lastTick) / 1000, 0.1); lastTick = now;
    let changed = false;
    for (const agent of world?.agents ?? []) {
      const packingAt=agent.world.miniWork?.packingAt;
      if (packingAt !== undefined && now >= packingAt+4500) { delete agent.world.miniWork; changed=true; }
      const visit = agent.world.carVisit;
      if (visit && now >= visit.startedAt + GARAGE_CAR_VISIT_MS) {
        const home = carHomes.get(agent.sessionId)!; carHomes.delete(agent.sessionId);
        const from = agent.world.movement?.to ?? agent.world.position, to = home.position;
        const waypoints = factory25dWaypoints(from,to);
        agent.world = {...home,position:from,movement:{from,to,waypoints,startedAt:now,arrivesAt:now+routeDistance(from,waypoints,to)/80*1000}}; changed=true;
      } else if (agent.world.movement && now >= agent.world.movement.arrivesAt) {
        agent.world = {...agent.world,position:agent.world.movement.to,movement:undefined}; changed=true;
      }
    }
    if(changed) update();
    if (!selected || !connected() || document.hidden) return;
    const agent = world.agents.find(agent => agent.sessionId === selected); if (!agent?.manualControl) return;
    const trip = agent.manualControl.elevatorTrip;
    if (trip) {
      if (now >= trip.arrivesAt) {
        agent.world = {zone:'manual',position:trip.arrival,facing:'down'};
        agent.manualControl = {...trip.arrival,facing:'down',moving:false};
        input = emptyInput(); update();
      }
      return;
    }
    if (!elevatorArmed) return;
    const x = Number(input.right) - Number(input.left), y = Number(input.down) - Number(input.up);
    const distance = Math.hypot(x, y), before = agent.world.position;
    if (distance) {
      const position = constrainFactoryStep(before, { x: before.x + x / distance * dt * CONTROL_MOVE_SPEED, y: before.y + y / distance * dt * CONTROL_MOVE_SPEED });
      const entrance = manualElevatorEntry(before, position);
      if (entrance) {
        const elevatorTrip = {...entrance,startedAt:now,arrivesAt:now+MANUAL_ELEVATOR_DURATION_MS};
        agent.world = {zone:'manual',position:entrance.departure,facing:'up'};
        agent.manualControl = {...entrance.departure,facing:'up',moving:false,elevatorTrip};
        elevatorArmed = false; input = emptyInput(); update(); return;
      }
      agent.world = { zone: 'manual', position, facing: x ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up' };
      agent.manualControl = { ...position, facing: agent.world.facing, moving: position.x !== before.x || position.y !== before.y };
      update();
    } else if (agent.manualControl.moving) { agent.manualControl = { ...agent.manualControl, moving: false }; update(); }
  }, 50);
  return {
    connect() { reset('connecting'); },
    logout() { reset('watching'); },
    avatar(method: 'GET' | 'PUT', avatar?: AvatarConfig) {
      if (method === 'PUT' && avatar) {
        look = { ...avatar }; world.agents = world.agents.map(agent => agent.ownerId === 'preview-owner' ? { ...agent, avatar: { ...look } } : agent); update();
      }
      return { avatar: { ...look } };
    },
    send(message: WSMessageToServer): boolean {
      if (!authenticated()) return false;
      if (message.type === 'logout') { reset('watching'); return true; }
      if (message.type === 'chat') {
        world = { ...world, chat: [...world.chat, { username: 'you · preview', message: message.message, timestamp: Date.now() }] }; update(); return true;
      }
      if (!('sessionId' in message)) return false;
      const agent = world.agents.find(agent => agent.sessionId === message.sessionId && agent.ownerId === 'preview-owner');
      if (!agent) return false;
      if (message.type === 'garage_car') {
        const error = !isGarageCarId(message.car) ? 'That car is unavailable.' : agent.activity !== 'idle' || agent.manualControl || agent.world.miniWork ? 'Choose an idle agent without walking controls.' : agent.world.carVisit ? 'Your agent is already visiting a car.' : world.agents.some(other=>other.sessionId!==agent.sessionId && (other.world.carVisit?.car===message.car || message.car==='mini' && (other.world.miniWork || other.world.zone==='work' && other.world.slotIndex===MINI_WORKSTATION_SLOT))) ? 'Someone is already using that car.' : undefined;
        if(error) { later(()=>receive({type:'garage_car_result',sessionId:agent.sessionId,success:false,error}),0); return true; }
        const from=agent.world.position,to=toFactoryWorld(garageCarLookout(message.car)),waypoints=factory25dWaypoints(from,to),now=Date.now(),arrivesAt=now+routeDistance(from,waypoints,to)/80*1000;
        carHomes.set(agent.sessionId,{...agent.world});
        agent.world={zone:'idle',position:from,facing:'up',carVisit:{car:message.car,startedAt:arrivesAt},movement:{from,to,waypoints,startedAt:now,arrivesAt}}; update();
        later(()=>receive({type:'garage_car_result',sessionId:agent.sessionId,success:true}),0);
      } else if (message.type === 'control_claim') {
        if (scenario === 'claiming') return true;
        const revision=actionRevision.get(agent.sessionId)??0;
        later(() => {
          if (revision !== (actionRevision.get(agent.sessionId)??0)) { receive({type:'control_result',action:'claim',sessionId:agent.sessionId,success:false,error:'The preview action changed. Choose take control again.'}); return; }
          if (scenario === 'error') { receive({ type: 'control_result', action: 'claim', sessionId: agent.sessionId, success: false, error: 'This agent is being controlled in another browser. Choose another agent or try again.' }); return; }
          if (selected === agent.sessionId && agent.manualControl) {
            receive({type:'control_result',action:'claim',sessionId:agent.sessionId,success:true}); return;
          }
          const previous = world.agents.find(item => item.sessionId === selected);
          if (previous) { settleElevator(previous); delete previous.manualControl; }
          selected = agent.sessionId;
          input = emptyInput(); elevatorArmed = true;
          carHomes.delete(agent.sessionId);
          const position = agent.world.zone === 'work' ? toFactoryWorld({ x: WORKSTATIONS[agent.world.slotIndex!].x, z: WORKSTATIONS[agent.world.slotIndex!].z + 0.8 }) : agent.world.position;
          agent.world = { zone: 'manual', position, facing: 'down' };
          agent.manualControl = { ...position, facing: 'down', moving: false }; update();
          receive({ type: 'control_result', action: 'claim', sessionId: selected, success: true });
        });
      } else if (message.type === 'control_release') {
        settleElevator(agent);
        epoch++; input = emptyInput(); elevatorArmed = true; selected = undefined; delete agent.manualControl; update();
        later(() => receive({ type: 'control_result', action: 'release', sessionId: agent.sessionId, success: true }), 0);
      } else if (message.type === 'control_input' && selected === agent.sessionId) {
        if (agent.manualControl?.elevatorTrip) return true;
        if (!elevatorArmed && Object.values(message.input).every(value => !value)) elevatorArmed = true;
        input = elevatorArmed ? {...message.input} : emptyInput();
      }
      else if (message.type === 'emote' && VALID_EMOTES.includes(message.emote as never)) receive({ type: 'effect', effect: 'emote', sessionId: agent.sessionId, data: { emote: message.emote } });
      else if (message.type === 'shoot' && !agent.manualControl?.elevatorTrip) receive({ type: 'effect', effect: 'shoot', sessionId: agent.sessionId, data: { facing: agent.world.facing } });
      else if (message.type === 'grab_start') {
        const position=currentPosition(agent);clearMiniControl(agent);
        agent.world={zone:'manual',position,facing:agent.world.facing};update();
        const revision=actionRevision.get(agent.sessionId);
        later(() => receive({ type: 'grab_result', action: 'start', sessionId: agent.sessionId, success: revision===actionRevision.get(agent.sessionId),
          ...(revision===actionRevision.get(agent.sessionId)?{}:{error:'The preview action changed.'}) }), 0);
      }
      else if (message.type === 'grab_end') {
        const slot=message.workstationSlot;
        const invalid=slot!==undefined && (!Number.isInteger(slot)||!WORKSTATIONS[slot]);
        const forbidden=slot===MINI_WORKSTATION_SLOT&&agent.username!==MINI_WORKSTATION_USERNAME;
        const occupied=slot!==undefined&&world.agents.some(other=>other.sessionId!==agent.sessionId&&(other.world.zone==='work'&&other.world.slotIndex===slot || slot===MINI_WORKSTATION_SLOT&&(other.world.carVisit?.car==='mini'||other.world.miniWork)));
        if(invalid||forbidden||occupied) {
          later(()=>receive({type:'grab_result',action:'end',sessionId:agent.sessionId,success:false,error:forbidden?'The Mini laptop is Jonathan’s workstation.':occupied?'That workstation is occupied.':'That workstation is unavailable.'}),0);return true;
        }
        clearMiniControl(agent);
        const position=slot===undefined?{x:message.x,y:message.y}:slotPosition('factory25d','work',slot);
        agent.world = { zone: slot === undefined ? 'manual' : 'work', slotIndex: slot, position, facing: slot===undefined?'down':'up',
          ...(slot===MINI_WORKSTATION_SLOT && zoneForActivity(agent.activity)==='work' ? {miniWork:{startedAt:Date.now()+1000}} : {}) };
        update(); later(() => receive({ type: 'grab_result', action: 'end', sessionId: agent.sessionId, success: true }), 0);
      }
      return true;
    },
    dispose() { epoch++; for (const timer of timers) clearTimeout(timer); clearInterval(tick); observer.disconnect(); stateEditor.dispose(); previewHelp.remove(); abort.abort(); tools.remove(); },
  };
}
