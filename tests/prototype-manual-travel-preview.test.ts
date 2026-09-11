import {afterEach, expect, it, vi} from 'vitest';
import {FACTORY_ELEVATOR, GARAGE_ELEVATOR, factoryRoomAt, fromFactoryWorld, toFactoryWorld} from '../shared/factory25d-layout';
import {MANUAL_ELEVATOR_DURATION_MS, MANUAL_ELEVATOR_SWITCH_MS} from '../shared/factory25d-manual-travel';
import {createControlPreview} from '../client/prototypes/factory25dControlPreview';
import type {BoardData} from '../client/prototypes/factory25dBoardData';
import type {ControlInputState} from '../shared/types';

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
  vi.stubGlobal('location',{search:'?controlsPreview=travel'});
  vi.stubGlobal('MutationObserver',class {observe(){} disconnect(){}});
  vi.stubGlobal('Option',class {constructor(public text:string,public value:string){}});
  const fetch=vi.fn(),socket=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('WebSocket',socket);
  let data:BoardData;const receive=vi.fn(),change=vi.fn();
  const preview=createControlPreview(next=>{data=next;},receive,vi.fn(),change);
  const controls=created[0],sessionId='preview-mine';
  const input=(direction?:keyof ControlInputState)=>preview.send({type:'control_input',sessionId,input:{up:direction==='up',down:direction==='down',left:direction==='left',right:direction==='right'}});
  return {preview,receive,change,fetch,socket,controls,input,data:()=>data!,agent:()=>data!.world!.agents.find(a=>a.sessionId===sessionId)!,
    click:(selector:string)=>controls.querySelector(selector).dispatchEvent(new Event('click')),
    claim:async()=>{preview.send({type:'control_claim',sessionId});await vi.advanceTimersByTimeAsync(700);},
    release:()=>preview.send({type:'control_release',sessionId})};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('walks into the lift in both directions, preserves control, and needs a fresh input after arrival',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  expect(f.change).toHaveBeenCalledWith('travel',expect.anything());
  expect(f.data().world!.agents).toHaveLength(1);
  expect(f.controls.querySelector('.preview-travel-actions').hidden).toBe(false);
  expect(f.controls.querySelector('.preview-activity').hidden).toBe(true);
  expect(f.agent()).toMatchObject({activity:'idle',ownerId:'preview-owner',world:{position:toFactoryWorld(FACTORY_ELEVATOR)}});
  await f.claim();f.input('up');await vi.advanceTimersByTimeAsync(200);
  const trip=f.agent().manualControl!.elevatorTrip!;
  expect(trip).toMatchObject({arrival:toFactoryWorld(GARAGE_ELEVATOR),startedAt:Date.now(),arrivesAt:Date.now()+MANUAL_ELEVATOR_DURATION_MS});
  expect(factoryRoomAt(fromFactoryWorld(trip.departure))).toBe('factory');
  expect(trip.departure.x).toBeCloseTo(toFactoryWorld(FACTORY_ELEVATOR).x);
  expect(fromFactoryWorld(trip.departure).z).toBeGreaterThanOrEqual(-3.2);
  const received=f.receive.mock.calls.length;
  f.preview.send({type:'shoot',sessionId:'preview-mine'});f.input('right');
  await vi.advanceTimersByTimeAsync(500);
  expect(f.agent().world.position).toEqual(trip.departure);
  expect(f.agent().manualControl!.elevatorTrip).toEqual(trip);
  expect(f.receive).toHaveBeenCalledTimes(received);
  await vi.advanceTimersByTimeAsync(MANUAL_ELEVATOR_DURATION_MS);
  expect(f.agent().manualControl).toEqual({...trip.arrival,facing:'down',moving:false});
  expect(f.agent().world.position).toEqual(trip.arrival);
  f.input('up');await vi.advanceTimersByTimeAsync(1000);
  expect(f.agent().world.position).toEqual(trip.arrival);
  expect(f.agent().manualControl!.elevatorTrip).toBeUndefined();
  f.input();f.input('up');await vi.advanceTimersByTimeAsync(200);
  expect(f.agent().manualControl!.elevatorTrip).toMatchObject({arrival:toFactoryWorld(FACTORY_ELEVATOR)});
  expect(factoryRoomAt(fromFactoryWorld(f.agent().manualControl!.elevatorTrip!.departure))).toBe('garage');
  await vi.advanceTimersByTimeAsync(MANUAL_ELEVATOR_DURATION_MS+50);
  expect(f.agent().world.position).toEqual(toFactoryWorld(FACTORY_ELEVATOR));
  f.input();f.input('down');await vi.advanceTimersByTimeAsync(100);
  expect(f.agent().world.position.y).toBeGreaterThan(toFactoryWorld(FACTORY_ELEVATOR).y);
  expect(f.agent().manualControl!.moving).toBe(true);
  expect(f.fetch).not.toHaveBeenCalled();expect(f.socket).not.toHaveBeenCalled();f.preview.dispose();
});

it.each([0,MANUAL_ELEVATOR_SWITCH_MS+40])('releasing control %i ms into travel lands on a real floor',async elapsed=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);await f.claim();
  f.input('up');await vi.advanceTimersByTimeAsync(200);
  const trip=f.agent().manualControl!.elevatorTrip!;
  await vi.advanceTimersByTimeAsync(elapsed);f.release();
  const expected=elapsed<MANUAL_ELEVATOR_SWITCH_MS?trip.departure:trip.arrival;
  expect(f.agent().manualControl).toBeUndefined();expect(f.agent().world.position).toEqual(expected);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.agent().world.position).toEqual(expected);expect(f.agent().world.movement).toBeUndefined();
  f.preview.dispose();
});

it('provides safe entrance shortcuts without taking over or dropping the selected agent',async()=>{
  const f=setup();await vi.advanceTimersByTimeAsync(0);
  f.click('.preview-by-patio');expect(f.agent().manualControl).toBeUndefined();
  expect(f.agent().world.position).toEqual(toFactoryWorld({x:7.3,z:-2.5}));
  await f.claim();f.input('right');await vi.advanceTimersByTimeAsync(700);
  expect(factoryRoomAt(fromFactoryWorld(f.agent().world.position))).toBe('patio');
  expect(f.agent().manualControl).toBeDefined();
  f.click('.preview-by-elevator');
  expect(f.agent().manualControl).toEqual({...toFactoryWorld(FACTORY_ELEVATOR),facing:'up',moving:false});
  f.input('up');await vi.advanceTimersByTimeAsync(200);
  f.click('.preview-by-patio');
  expect(f.agent().manualControl).toEqual({...toFactoryWorld({x:7.3,z:-2.5}),facing:'right',moving:false});
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.agent().world.position).toEqual(toFactoryWorld({x:7.3,z:-2.5}));
  expect(f.receive.mock.calls.filter(([message])=>message.type==='control_revoked')).toHaveLength(0);
  const picker=f.controls.querySelector('select');picker.value='ready';picker.dispatchEvent(new Event('change'));
  expect(f.controls.querySelector('.preview-travel-actions').hidden).toBe(true);
  f.preview.dispose();
});
