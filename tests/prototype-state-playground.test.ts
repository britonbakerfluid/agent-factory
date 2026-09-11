import { afterEach, expect, it, vi } from 'vitest';
import { createControlPreview } from '../client/prototypes/factory25dControlPreview';
import { AGENT_VISUAL_STATES, DEFAULT_AGENT_STYLES, activityForVisualState, agentStateStyle, resetAgentStateStyle, resolveAgentVisualState } from '../client/prototypes/factory25dAgentStates';
import { slotPosition } from '../shared/world-layouts';
import type { BoardData } from '../client/prototypes/factory25dBoardData';

class Element extends EventTarget {
  className='';innerHTML='';textContent='';value='';hidden=false;disabled=false;open=false;dataset={state:'ready'};
  children=new Map<string,Element>(); options: unknown[]=[];
  querySelector(selector:string) { if(!this.children.has(selector)) this.children.set(selector,new Element()); return this.children.get(selector)!; }
  setAttribute() {} append() {} after() {} remove() {} add(option:unknown) { this.options.push(option); }
}
function setup() {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
  const panel=new Element(),created:Element[]=[];
  vi.stubGlobal('document',{hidden:false,body:{append(){}},createElement:()=>{const element=new Element();created.push(element);return element;},querySelector:()=>panel});
  vi.stubGlobal('window',{matchMedia:()=>Object.assign(new EventTarget(),{matches:false})});
  vi.stubGlobal('location',{search:'?controlsPreview=activity'});
  vi.stubGlobal('MutationObserver',class {observe(){} disconnect(){}});
  vi.stubGlobal('Option',class {constructor(public text:string,public value:string){}});
  const storage={setItem:vi.fn()},fetch=vi.fn(),socket=vi.fn();
  vi.stubGlobal('localStorage',storage);vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',socket);
  let data:BoardData;const publish=vi.fn((next:BoardData)=>{data=next;}),changed=vi.fn();
  const preview=createControlPreview(publish,vi.fn(),vi.fn(),changed);
  const controls=created[0],editor=created.find(element=>element.className==='factory-state-editor')!;
  const change=(selector:string,value:string,event='change')=>{const input=editor.querySelector(selector);input.value=value;input.dispatchEvent(new Event(event));};
  const scenario=(value:string)=>{const input=controls.querySelector('select');input.value=value;input.dispatchEvent(new Event('change'));};
  return {preview,publish,changed,controls,editor,storage,fetch,socket,change,scenario,agent:()=>data!.world!.agents[0],data:()=>data!,
    choose:(value:string)=>change('[aria-label="Agent visual state"]',value),click:(selector:string)=>editor.querySelector(selector).dispatchEvent(new Event('click'))};
}
afterEach(()=>{for(const state of AGENT_VISUAL_STATES) resetAgentStateStyle(state);vi.useRealTimers();vi.unstubAllGlobals();});

it('previews all activity and attention states on one sample at a real workstation without live transport',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  expect(f.changed).toHaveBeenCalledWith('activity',expect.anything());
  expect(f.data().world!.agents).toHaveLength(1);
  expect(f.controls.querySelector('.preview-activity').hidden).toBe(false);
  for(const state of AGENT_VISUAL_STATES) {
    f.choose(state);
    expect(resolveAgentVisualState(f.agent())).toBe(state);
    expect(f.agent().activity).toBe(activityForVisualState(state));
    expect(f.agent().world.position).toEqual(slotPosition('factory25d','work',1));
    if(['input','permission','ready','error'].includes(state)) expect(f.agent().attention).toEqual({kind:state,since:Date.now()});
    else expect(f.agent().attention).toBeUndefined();
  }
  f.choose('writing');expect(f.agent().currentTool).toBe('Edit');
  f.choose('input');expect(f.agent().currentTool).toBe('AskUserQuestion');
  f.choose('idle');expect(f.agent().currentTool).toBeNull();expect(f.agent().world.zone).toBe('idle');
  f.choose('stopped');expect(f.agent().activity).toBe('stopped');expect(f.agent().attention).toBeUndefined();
  f.scenario('ready');expect(f.controls.querySelector('.preview-activity').hidden).toBe(true);expect(f.data().world!.agents).toHaveLength(3);
  expect(f.fetch).not.toHaveBeenCalled();expect(f.socket).not.toHaveBeenCalled();f.preview.dispose();
});

it('prefills real styles, saves each selected state locally and resets only that state',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);f.choose('writing');
  expect(f.editor.querySelector('[aria-label="Animation frames per second"]').value).toBe(String(DEFAULT_AGENT_STYLES.writing.fps));
  f.change('[aria-label="Agent pose"]','sit');
  f.change('[aria-label="Animation frames per second"]','9','input');
  f.change('[aria-label="Speech bubble mode"]','text');
  f.change('[aria-label="Bubble message"]','editing the checkout');
  f.change('[aria-label="Bubble color"]','#e0aabb','input');
  expect(agentStateStyle('writing')).toMatchObject({pose:'sit',fps:9,bubble:'text',text:'editing the checkout',color:'#e0aabb'});
  expect(f.editor.querySelector('.state-glyph-label').hidden).toBe(true);expect(f.editor.querySelector('.state-text-label').hidden).toBe(false);
  expect(f.storage.setItem).toHaveBeenLastCalledWith('factory.agent-styles.v1',expect.stringContaining('editing the checkout'));
  f.choose('reading');f.change('[aria-label="Animation frames per second"]','5','input');
  f.choose('writing');f.click('.state-reset');
  expect(agentStateStyle('writing')).toEqual(DEFAULT_AGENT_STYLES.writing);expect(agentStateStyle('reading').fps).toBe(5);
  expect(f.editor.querySelector('[aria-label="Bubble message"]').value).toBe(DEFAULT_AGENT_STYLES.writing.text);
  f.preview.dispose();
});

it('plays a complete turn and cancels pending transitions when choosing a state, resetting, leaving or disposing',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  f.click('.state-demo');expect(resolveAgentVisualState(f.agent())).toBe('thinking');
  await vi.advanceTimersByTimeAsync(10000);expect(resolveAgentVisualState(f.agent())).toBe('input');
  await vi.advanceTimersByTimeAsync(6500);expect(resolveAgentVisualState(f.agent())).toBe('ready');
  expect(f.editor.querySelector('.state-demo').textContent).toBe('play a turn');
  f.click('.state-demo');f.choose('searching');await vi.advanceTimersByTimeAsync(20000);expect(resolveAgentVisualState(f.agent())).toBe('searching');
  f.click('.state-demo');f.controls.querySelector('.preview-reset').dispatchEvent(new Event('click'));
  await vi.advanceTimersByTimeAsync(20000);expect(resolveAgentVisualState(f.agent())).toBe('thinking');
  f.click('.state-demo');f.scenario('ready');await vi.advanceTimersByTimeAsync(20000);expect(f.data().world!.agents.every(agent=>agent.activity==='reading')).toBe(true);
  f.scenario('activity');f.click('.state-demo');f.preview.dispose();const count=f.publish.mock.calls.length;
  await vi.advanceTimersByTimeAsync(20000);expect(f.publish).toHaveBeenCalledTimes(count);
});
