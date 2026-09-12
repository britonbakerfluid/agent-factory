import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { PickupMotionManager } from '../server/pickup-motion';
import { BroadcastManager } from '../server/ws/broadcast';
import { SharedPickupView } from '../client/prototypes/factory25dSharedPickup';
import { validPickupPose, type PickupPose, type PickupTarget } from '../shared/pickup-motion';
function peer() {
  const messages: any[] = [];
  return { socket: { readyState: 1, on() {}, send(raw: string) { messages.push(JSON.parse(raw)); } } as unknown as WebSocket, messages };
}
const pose = (y = 2): PickupPose => ({ position: [3,y,8], home: [3,.3,8], scale: [1,1,1], rotation: .1,
  pin: [0,.4,0], height: 1.7, landing: [3,8], stage:'lifted', atlas:'normal', uv:[0,0,.25,1] });
function setup() {
  let now = 1000; const broadcast = new BroadcastManager(), a = peer(), b = peer(); broadcast.add(a.socket); broadcast.add(b.socket);
  const held = new Map<WebSocket,string>(); const manager = new PickupMotionManager(broadcast, (ws,id) => held.get(ws) === id, () => now);
  const step = (ms = 50) => { now += ms; manager.tick(); };
  const begin = (target:PickupTarget = 'staff:june', p = a) => {
    manager.receive(p.socket,{type:'pickup_motion',action:'begin',target,requestId:'request-'+now});
    return p.messages.filter(m=>m.type==='pickup_result').at(-1)?.lease as string | undefined;
  };
  const send = (lease:string, value=pose(), sequence=0, p=a, target:PickupTarget='staff:june') => manager.receive(p.socket,{type:'pickup_motion',action:'pose',target,lease,sequence,pose:value});
  return {manager,a,b,held,step,begin,send};
}
describe('shared pickup leases and exact motion',()=>{
  it.each(['staff:milo','staff:june','staff:remy'] as const)('relays %s cloth, altitude, spin and current landing to observers and late joiners',target=>{
    const f=setup(),lease=f.begin(target)!;f.send(lease,pose(),0,f.a,target);f.step();
    const late=peer();f.manager.sendActive(late.socket);
    expect(late.messages[0]).toEqual(f.b.messages.at(-1));expect(late.messages[0].frames[0].pose).toEqual(pose());
    f.send(lease,{...pose(1.2),stage:'dunking',pin:null,rotation:5,scale:[.7,1.1,1]},1,f.a,target);f.step();
    expect(f.b.messages.at(-1).frames[0].pose.rotation).toBe(5);
  });
  it('rejects a second holder, forged poses, stale sequences and repeated start floods',()=>{
    const f=setup(),lease=f.begin()!;expect(f.begin('staff:june',f.b)).toBeUndefined();
    f.send(lease,pose(),0,f.b);expect(f.manager.snapshot().frames[0].pose).toBeUndefined();
    for(const value of [null, {...pose(),position:[NaN,2,3]}, {...pose(),pin:[1e9,0,0]}, {...pose(),scale:[100,1,1]}, {...pose(),uv:[0,0,0,1]}]){
      expect(validPickupPose(value)).toBe(false);f.send(lease,value as PickupPose);
    }
    f.send(lease,pose(),2);f.step();f.send(lease,pose(5),1);expect(f.manager.snapshot().frames[0].pose?.position[1]).toBe(2);
    for(let i=0;i<1000;i++)f.begin();expect(f.a.messages.length).toBeLessThan(5);
  });
  it('requires a real agent grab lease and retains only its finite release animation',()=>{
    const f=setup(),target='agent:qa' as const;
    expect(f.begin(target)).toBeUndefined();f.step(300);f.held.set(f.a.socket,'qa');const lease=f.begin(target)!;
    f.send(lease,pose(),0,f.a,target);f.step();f.held.clear();
    f.send(lease,pose(4),1,f.a,target);expect(f.manager.snapshot().frames[0].pose?.position[1]).toBe(2);
    f.send(lease,{...pose(1),stage:'falling',pin:null},2,f.a,target);f.step();
    expect(f.b.messages.at(-1).frames[0].pose.position[1]).toBe(1);
    f.manager.receive(f.a.socket,{type:'pickup_motion',action:'finish',target,lease});f.step(150);
    expect(f.manager.snapshot().frames).toHaveLength(0);
  });
  it('does not rebroadcast extra client payload fields',()=>{
    const f=setup(),lease=f.begin()!;f.send(lease,{...pose(),untrusted:'x'.repeat(60000)} as PickupPose);f.step();
    expect(JSON.stringify(f.manager.snapshot()).length).toBeLessThan(1000);
  });
  it('a new granted grab invalidates every old throw packet',()=>{
    const f=setup(),target='agent:qa' as const;f.held.set(f.a.socket,'qa');const old=f.begin(target)!;
    f.send(old,pose(),0,f.a,target);f.step(300);f.held.clear();f.held.set(f.b.socket,'qa');const fresh=f.begin(target,f.b)!;
    expect(fresh).not.toBe(old);f.send(old,pose(9),99,f.a,target);f.send(fresh,pose(3),0,f.b,target);
    expect(f.manager.snapshot().frames[0].pose?.position[1]).toBe(3);
  });
  it.each(['disconnect','timeout'])('lands and returns an abandoned staff pickup after %s, then frees the lease',reason=>{
    const f=setup(),lease=f.begin()!;f.send(lease,pose());f.step();
    if(reason==='disconnect')f.manager.disconnect(f.a.socket);else f.step(1600);
    f.step(300);const recovery=f.manager.snapshot().frames[0];expect(recovery.recovering).toBe(true);
    expect(recovery.pose!.position[1]).toBeLessThan(2);expect(recovery.pose!.stage).toBe('falling');
    const late=peer();f.manager.sendActive(late.socket);expect(late.messages[0].frames).toEqual(f.manager.snapshot().frames);
    f.step(2000);expect(f.manager.busy('staff:june')).toBe(false);expect(f.begin('staff:june',f.b)).toBeTruthy();
  });
  it('interpolates the actual altitude/rotation independently of camera, ignores stale frames, and resets on recovery',()=>{
    let now=0;const sent:any[]=[],view=new SharedPickupView(message=>{sent.push(message);return true;},()=>now);
    const state=(revision:number,p=pose())=>({type:'pickup_state' as const,epoch:'a',revision,frames:[{target:'staff:june' as const,lease:'l',sequence:revision,pose:p}]});
    view.handle(state(1));expect(view.sample('staff:june')?.position[1]).toBe(2);
    view.handle(state(2,pose(4)));now=25;expect(view.sample('staff:june')?.position[1]).toBe(3);
    view.handle(state(1,pose(99)));expect(view.sample('staff:june')?.position[1]).toBe(3);
    now=50;expect(view.sample('staff:june')?.position[1]).toBe(4);
    view.begin('staff:june');view.handle({type:'pickup_result',requestId:sent.at(-1).requestId,target:'staff:june',lease:'l'});
    expect(view.owns('staff:june')).toBe(true);expect(view.sample('staff:june')).toBeUndefined();
    const recovery=state(3);recovery.frames[0]={...recovery.frames[0],recovering:true} as any;view.handle(recovery);
    expect(view.owns('staff:june')).toBe(false);expect(view.sample('staff:june')).toBeDefined();
    view.reset();expect(view.sample('staff:june')).toBeUndefined();
  });
});
