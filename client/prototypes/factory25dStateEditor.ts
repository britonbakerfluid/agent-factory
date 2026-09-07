import { AGENT_VISUAL_STATES, agentStateStyle, resetAgentStateStyle, setAgentStateStyle, type AgentStateStyle, type AgentVisualState } from './factory25dAgentStates';
import './factory25dStateEditor.css';

const names: Record<AgentVisualState, string> = {
  idle: 'taking a break', thinking: 'thinking', reading: 'reading files', writing: 'writing code', running: 'running a command',
  searching: 'searching', chatting: 'working with agents', planning: 'planning', compacting: 'organizing context',
  waiting: 'waiting · unspecified', input: 'needs your input', permission: 'needs approval', ready: 'ready for review', error: 'hit a problem', stopped: 'session ended',
};
const demo: AgentVisualState[] = ['thinking', 'reading', 'writing', 'running', 'input', 'thinking', 'ready'];

/** This editor only changes browser-local presentation preferences and in-memory sample state. */
export function createAgentStateEditor(stateChanged: (state: AgentVisualState) => void, styleChanged: () => void) {
  const element = document.createElement('section'); element.className = 'factory-state-editor';
  element.setAttribute('aria-label', 'Agent state tuning');
  element.innerHTML = '<p>one sample agent · looks are saved only in this browser</p><label>agent state<select aria-label="Agent visual state"></select></label><div class="state-editor-pair"><label>pose<select aria-label="Agent pose"><option value="idle">standing</option><option value="work">working</option><option value="sit">sitting</option></select></label><label>speed <output></output><input aria-label="Animation frames per second" type="range" min="0" max="10" step="1"></label></div><label>speech bubble<select aria-label="Speech bubble mode"><option value="icon">small symbol</option><option value="text">short message</option><option value="hidden">hidden</option></select></label><label class="state-glyph-label">symbol<input aria-label="Bubble symbol" maxlength="3"></label><label class="state-text-label">message<input aria-label="Bubble message" maxlength="32"></label><label class="state-color-label">bubble color<input aria-label="Bubble color" type="color"></label><div class="preview-actions"><button class="state-reset">reset this look</button><button class="state-demo">play a turn</button></div><p class="state-demo-status" role="status">choose a state to tune its look</p>';
  const statePicker = element.querySelector<HTMLSelectElement>('[aria-label="Agent visual state"]')!;
  const pose = element.querySelector<HTMLSelectElement>('[aria-label="Agent pose"]')!;
  const fps = element.querySelector<HTMLInputElement>('[aria-label="Animation frames per second"]')!;
  const bubble = element.querySelector<HTMLSelectElement>('[aria-label="Speech bubble mode"]')!;
  const glyph = element.querySelector<HTMLInputElement>('[aria-label="Bubble symbol"]')!;
  const text = element.querySelector<HTMLInputElement>('[aria-label="Bubble message"]')!;
  const color = element.querySelector<HTMLInputElement>('[aria-label="Bubble color"]')!;
  const play = element.querySelector<HTMLButtonElement>('.state-demo')!;
  const status = element.querySelector<HTMLElement>('.state-demo-status')!;
  const abort = new AbortController(), events = { signal: abort.signal };
  let state: AgentVisualState = 'thinking', timer: ReturnType<typeof setTimeout> | undefined, playing = false;
  for (const id of AGENT_VISUAL_STATES) statePicker.add(new Option(names[id], id));
  function fill() {
    const style = agentStateStyle(state); statePicker.value = state;
    pose.value = style.pose; fps.value = String(style.fps); bubble.value = style.bubble;
    glyph.value = style.glyph; text.value = style.text; color.value = style.color;
    element.querySelector('output')!.textContent = `${style.fps} fps`;
    element.querySelector<HTMLElement>('.state-glyph-label')!.hidden = style.bubble !== 'icon';
    element.querySelector<HTMLElement>('.state-text-label')!.hidden = style.bubble !== 'text';
    element.querySelector<HTMLElement>('.state-color-label')!.hidden = style.bubble === 'hidden';
  }
  function stop() {
    if (timer !== undefined) clearTimeout(timer); timer = undefined; playing = false;
    play.textContent = 'play a turn'; status.textContent = `tuning · ${names[state]}`;
  }
  function select(next: AgentVisualState) { stop(); state = next; fill(); status.textContent = `tuning · ${names[state]}`; stateChanged(state); }
  function edit(patch: Partial<AgentStateStyle>) { stop(); setAgentStateStyle(state, patch); fill(); styleChanged(); }
  statePicker.addEventListener('change', () => select(statePicker.value as AgentVisualState), events);
  pose.addEventListener('change', () => edit({ pose: pose.value as AgentStateStyle['pose'] }), events);
  fps.addEventListener('input', () => edit({ fps: Number(fps.value) }), events);
  bubble.addEventListener('change', () => edit({ bubble: bubble.value as AgentStateStyle['bubble'] }), events);
  glyph.addEventListener('change', () => edit({ glyph: glyph.value }), events);
  text.addEventListener('change', () => edit({ text: text.value }), events);
  color.addEventListener('input', () => edit({ color: color.value }), events);
  element.querySelector('.state-reset')!.addEventListener('click', () => { stop(); resetAgentStateStyle(state); fill(); styleChanged(); }, events);
  play.addEventListener('click', () => {
    if (playing) { stop(); return; }
    stop(); playing = true; play.textContent = 'stop turn';
    const step = (index: number) => {
      state = demo[index]; fill(); stateChanged(state);
      status.textContent = `sample turn · ${index + 1}/${demo.length} · ${names[state]}`;
      if (index + 1 < demo.length) timer = setTimeout(() => step(index + 1), state === 'input' ? 4000 : 2500);
      else { playing = false; timer = undefined; play.textContent = 'play a turn'; }
    };
    step(0);
  }, events);
  fill();
  return { element, get state() { return state; }, select, stop, dispose() { stop(); abort.abort(); element.remove(); } };
}
