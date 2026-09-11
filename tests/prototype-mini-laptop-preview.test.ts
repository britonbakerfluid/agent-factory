import {afterEach, expect, it, vi} from 'vitest';
import {DEFAULT_AVATAR} from '../shared/constants';
import {MINI_WORKSTATION_SLOT, MINI_WORKSTATION_USERNAME, toFactoryWorld} from '../shared/factory25d-layout';
import {positionAt, slotPosition} from '../shared/world-layouts';
import {createControlPreview} from '../client/prototypes/factory25dControlPreview';
import type {BoardData} from '../client/prototypes/factory25dBoardData';

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
  vi.stubGlobal('location',{search:'?controlsPreview=mini-laptop'});
  vi.stubGlobal('MutationObserver',class {observe(){} disconnect(){}});
  vi.stubGlobal('Option',class {constructor(public text:string,public value:string){}});
  const fetch=vi.fn(),socket=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',socket);
  let data:BoardData;const receive=vi.fn(),change=vi.fn();
  const preview=createControlPreview(next=>{data=next;},receive,vi.fn(),change);
  const tools=created[0];
  return {preview,receive,change,fetch,socket,tools,data:()=>data!,agent:()=>data!.world!.agents.find(a=>a.sessionId==='preview-mine')!,
    click:(selector:string)=>tools.querySelector(selector).dispatchEvent(new Event('click'))};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('runs one clearly labeled Mini work demo, packs before a safe departure, and resets without touching live transport',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  expect(f.change).toHaveBeenCalledWith('mini-laptop',expect.anything());
  expect(f.agent()).toMatchObject({sessionName:'Jonathan · preview',username:MINI_WORKSTATION_USERNAME,ownerId:'preview-owner',activity:'reading',avatar:DEFAULT_AVATAR});
  expect(f.agent().world).toMatchObject({zone:'work',slotIndex:MINI_WORKSTATION_SLOT,position:slotPosition('factory25d','work',MINI_WORKSTATION_SLOT),miniWork:{startedAt:Date.now()+1000}});
  expect(f.data().world!.agents.filter(a=>a.world.miniWork)).toHaveLength(1);
  expect(f.tools.querySelector('.preview-mini-actions').hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(7000);
  const previousStart=f.agent().world.miniWork!.startedAt;
  f.click('.preview-mini-start');
  expect(f.agent().world.miniWork!.startedAt).toBeGreaterThan(previousStart);
  expect(f.agent().world.miniWork!.startedAt).toBe(Date.now()+1000);
  f.click('.preview-mini-pack');
  const movement=f.agent().world.movement!;
  expect(f.agent().world.miniWork?.packingAt).toBe(Date.now());expect(f.agent().activity).toBe('idle');
  expect(f.tools.querySelector('.preview-mini-pack').disabled).toBe(true);
  f.preview.send({type:'garage_car',sessionId:'preview-mine',car:'mini'});await vi.advanceTimersByTimeAsync(0);
  expect(f.receive).toHaveBeenLastCalledWith(expect.objectContaining({type:'garage_car_result',success:false}));
  expect(movement.startedAt).toBe(Date.now()+4500);
  expect(positionAt(movement,Date.now()+4499)).toEqual(movement.from);
  expect(movement.to).toEqual(toFactoryWorld({x:2.2,z:28.1}));
  await vi.advanceTimersByTimeAsync(movement.arrivesAt-Date.now()+100);
  expect(f.agent().world.miniWork).toBeUndefined();
  expect(f.agent().world.position).toEqual(movement.to);expect(f.agent().world.movement).toBeUndefined();
  f.click('.preview-mini-start');expect(f.agent().world.miniWork!.startedAt).toBeGreaterThan(Date.now()+1000);
  const picker=f.tools.querySelector('select');picker.value='ready';picker.dispatchEvent(new Event('change'));
  await vi.advanceTimersByTimeAsync(12000);
  expect(f.tools.querySelector('.preview-mini-actions').hidden).toBe(true);
  expect(f.data().world!.agents.some(a=>a.world.miniWork)).toBe(false);
  expect(f.fetch).not.toHaveBeenCalled();expect(f.socket).not.toHaveBeenCalled();f.preview.dispose();
});

it('cancels stale control grants and clears Mini work for manual/grab actions while enforcing identity and station snapping',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  f.preview.send({type:'garage_car',sessionId:'preview-mine',car:'mini'});await vi.advanceTimersByTimeAsync(0);
  expect(f.receive).toHaveBeenLastCalledWith(expect.objectContaining({type:'garage_car_result',success:false}));
  f.preview.send({type:'control_claim',sessionId:'preview-mine'});f.click('.preview-mini-start');
  await vi.advanceTimersByTimeAsync(700);
  expect(f.agent().world.miniWork).toBeDefined();expect(f.agent().manualControl).toBeUndefined();
  expect(f.receive).toHaveBeenLastCalledWith(expect.objectContaining({type:'control_result',success:false}));
  f.preview.send({type:'control_claim',sessionId:'preview-mine'});await vi.advanceTimersByTimeAsync(700);
  expect(f.agent().manualControl).toBeDefined();expect(f.agent().world.miniWork).toBeUndefined();
  f.click('.preview-mini-start');expect(f.agent().manualControl).toBeUndefined();
  f.preview.send({type:'grab_start',sessionId:'preview-mine',x:300,y:900});
  expect(f.agent().world.miniWork).toBeUndefined();await vi.advanceTimersByTimeAsync(0);
  f.preview.send({type:'grab_end',sessionId:'preview-patio',x:999,y:999,workstationSlot:MINI_WORKSTATION_SLOT});await vi.advanceTimersByTimeAsync(0);
  expect(f.receive).toHaveBeenLastCalledWith(expect.objectContaining({type:'grab_result',action:'end',success:false}));
  f.preview.send({type:'grab_end',sessionId:'preview-mine',x:999,y:999,workstationSlot:MINI_WORKSTATION_SLOT});await vi.advanceTimersByTimeAsync(0);
  expect(f.agent().world.position).toEqual(slotPosition('factory25d','work',MINI_WORKSTATION_SLOT));
  expect(f.agent().world.miniWork).toBeDefined();
  f.preview.send({type:'grab_end',sessionId:'preview-mine',x:999,y:999,workstationSlot:1});await vi.advanceTimersByTimeAsync(6000);
  expect(f.agent().world.slotIndex).toBe(1);expect(f.agent().world.miniWork).toBeUndefined();
  f.click('.preview-mini-start');f.click('.preview-mini-pack');
  f.preview.send({type:'grab_end',sessionId:'preview-mine',x:999,y:999,workstationSlot:MINI_WORKSTATION_SLOT});
  expect(f.agent().activity).toBe('idle');expect(f.agent().world.miniWork).toBeUndefined();
  f.preview.dispose();
});
