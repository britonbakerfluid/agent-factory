import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast';
import { VisitorBasketball } from '../server/visitor-basketball';
import { visitorShotVelocity, stepVisitorBall, VISITOR_BALL_RIM, VISITOR_BALL_RADIUS, validBallVector, type FlyingBall } from '../shared/visitor-basketball';
const position = { x: 1.3, y: .6, z: -5.65 };
function setup() {
  let time = 1000;
  const broadcast = new BroadcastManager();
  const socket = () => { const s = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() }); broadcast.add(s as unknown as WebSocket); return s as unknown as WebSocket & { send: ReturnType<typeof vi.fn> }; };
  const a = socket(), b = socket(), relay = new VisitorBasketball(broadcast, () => time);
  return { a, b, relay, socket, later: (ms: number) => { time += ms; }, messages: (s = b) => s.send.mock.calls.map(([raw]) => JSON.parse(raw)) };
}
describe('public ghost basketball', () => {
  it('lets an unauthenticated viewer move a ghost for others without echoing it or trusting a supplied identity', () => {
    const s = setup();
    s.relay.receive(s.a, { phase: 'hold', visitorId: 'impersonation', position: { ...position, privateData: 'never broadcast' } });
    const message = s.messages()[0];
    expect(message).toMatchObject({ type: 'visitor_ball_update', phase: 'hold', position, serverTime: 1000 });
    expect(message.visitorId).not.toBe('impersonation'); expect(message.position.privateData).toBeUndefined();
    expect(s.messages(s.a)).toEqual([]);
    s.relay.receive(s.a, { phase: 'throw', position, velocity: visitorShotVelocity(position) });
    expect(s.messages().at(-1)).toMatchObject({ phase: 'throw', visitorId: message.visitorId });
  });
  it('rejects malformed, unbounded, and unstarted throws and limits repeated holds', () => {
    const s = setup();
    for (const invalid of [null, {}, { phase: 'shoot' }, { phase: 'throw', position, velocity: position },
      { phase: 'hold', position: { ...position, y: NaN } }, { phase: 'hold', position: { ...position, x: 99 } }]) s.relay.receive(s.a, invalid);
    expect(s.messages()).toEqual([]);
    s.relay.receive(s.a, { phase: 'hold', position });
    for (let i = 0; i < 100; i++) s.relay.receive(s.a, { phase: 'hold', position });
    expect(s.messages()).toHaveLength(1);
    s.later(70); s.relay.receive(s.a, { phase: 'hold', position }); expect(s.messages()).toHaveLength(2);
    s.relay.receive(s.a, { phase: 'throw', position, velocity: { x: Infinity, y: 2, z: 0 } }); expect(s.messages()).toHaveLength(2);
  });
  it('syncs a recent shot to a new viewer and removes it on cancel, disconnect, or idle timeout', () => {
    const s = setup(); s.relay.receive(s.a, { phase: 'hold', position });
    const c = s.socket(); s.relay.sendActive(c); expect(s.messages(c)).toHaveLength(1);
    s.relay.disconnect(s.a); expect(s.messages().at(-1).phase).toBe('cancel');
    const d = s.socket(); s.relay.sendActive(d); expect(s.messages(d)).toEqual([]);
    s.relay.receive(s.b, { phase: 'hold', position }); s.later(8001); s.relay.expire();
    expect(s.messages(c).at(-1).phase).toBe('cancel');
    const e = s.socket(); s.relay.sendActive(e); expect(s.messages(e)).toEqual([]);
  });
  it('caps active peer allocation and does not let one viewer cancel another’s ghost', () => {
    const s = setup(); s.relay.receive(s.a, { phase: 'hold', position });
    s.relay.receive(s.b, { phase: 'cancel', visitorId: s.messages()[0].visitorId });
    const c = s.socket(); s.relay.sendActive(c); expect(s.messages(c)).toHaveLength(1);
    for (let i = 0; i < 70; i++) s.relay.receive(s.socket(), { phase: 'hold', position });
    const late = s.socket(); s.relay.sendActive(late); expect(s.messages(late)).toHaveLength(64);
  });
});
describe('visitor shot physics', () => {
  it('makes a downward basket from both a low pickup and a raised cursor, at different frame rates', () => {
    for (const y of [VISITOR_BALL_RADIUS, .6, 2.3]) for (const dt of [1 / 60, .1]) {
      const p = { ...position, y }, ball: FlyingBall = { position: p, velocity: visitorShotVelocity(p), scored: false };
      let baskets = 0;
      for (let time = 0; time < 3; time += dt) if (stepVisitorBall(ball, dt).swish) baskets++;
      expect(baskets).toBe(1); expect(ball.position.y).toBeGreaterThanOrEqual(VISITOR_BALL_RADIUS);
    }
  });
  it('reaches the rim from hovering balls at different room positions', () => {
    for(const x of [-2,.5,1.3,3])for(const z of [-5,-3,0])for(const dt of [1/60,.1]){
      const position={x,y:1.05,z};
      const ball: FlyingBall={position:{...position},velocity:visitorShotVelocity(position),scored:false};
      for(let t=0;t<2;t+=dt)stepVisitorBall(ball,dt);
      expect(ball.scored,`shot from ${x}, ${z} at ${dt}`).toBe(true);
    }
  });
  it('does not award a sideways miss or upward pass and keeps finite bounded positions', () => {
    const p = { ...position, x: 2.2 }, ball: FlyingBall = { position: p, velocity: visitorShotVelocity(p, { ...VISITOR_BALL_RIM, x: 2.2 }), scored: false };
    for (let i = 0; i < 60; i++) stepVisitorBall(ball, .1);
    expect(ball.scored).toBe(false); expect(validBallVector(ball.position)).toBe(true);
    const up: FlyingBall = { position: { ...VISITOR_BALL_RIM, y: 1.67 }, velocity: { x: 0, y: 2, z: 0 }, scored: false };
    expect(stepVisitorBall(up, .02).swish).toBe(false);
  });
});

describe('manual pull-back shots and room travel', () => {
  it('uses pull direction and strength, with no hoop correction', async () => {
    const { visitorPullVelocity } = await import('../shared/visitor-basketball');
    expect(visitorPullVelocity({x:0,z:0})).toEqual({x:0,y:0,z:0});
    const soft = visitorPullVelocity({x:0,z:-.2}), hard = visitorPullVelocity({x:0,z:-1.2});
    expect(Math.abs(hard.z)).toBeGreaterThan(Math.abs(soft.z));
    expect(hard.y).toBeGreaterThan(soft.y);
    expect(visitorPullVelocity({x:1,z:0}).z).toBe(0);
    expect(visitorPullVelocity({x:1,z:0}).x).toBeGreaterThan(0);
    expect(validBallVector(visitorPullVelocity({x:100,z:-100}),true)).toBe(true);
    expect(visitorPullVelocity({x:NaN,z:0})).toEqual({x:0,y:0,z:0});
  });
  it('rewards a well-aimed short shot and misses with the same power off-axis at slow or fast frame rates', async () => {
    const { visitorPullVelocity } = await import('../shared/visitor-basketball');
    for (const dt of [1/120,1/30,.1]) {
      for (const x of [0,.18]) {
        const ball: FlyingBall = {position:{x:1.3,y:.55,z:-5.65},velocity:visitorPullVelocity({x,z:-.11}),scored:false};
        for(let t=0;t<3;t+=dt) stepVisitorBall(ball,dt);
        expect(ball.scored).toBe(x===0);
      }
    }
  });
  it('allows persistent floor positions across the full factory, lower patio, and garage', () => {
    for (const room of ['factory','patio','garage'] as const) {
      const p = room === 'factory' ? {x:-3,y:.55,z:8.5} : room === 'patio' ? {x:15,y:.55,z:9} : {x:3,y:.55,z:8};
      const ball: FlyingBall = {position:p,velocity:{x:0,y:0,z:0},scored:false,room};
      for(let i=0;i<400;i++) stepVisitorBall(ball,.05);
      expect(validBallVector(ball.position,false,room)).toBe(true);
      expect(ball.position.x).toBeCloseTo(p.x);
      expect(ball.position.y).toBeCloseTo(room==='patio' ? -1.12 + VISITOR_BALL_RADIUS : VISITOR_BALL_RADIUS);
      expect(Math.hypot(ball.velocity.x,ball.velocity.y,ball.velocity.z)).toBeLessThan(.1);
    }
  });
  it('connects only the elevator cabins and patio door, with valid destination positions', async () => {
    const { visitorBallExit } = await import('../shared/visitor-ball-travel');
    for (const [room, p, destination] of [
      ['factory',{x:-7.1,y:.5,z:-5.2},'garage'], ['garage',{x:-10.5,y:.5,z:-3.2},'factory'],
      ['factory',{x:7.7,y:.5,z:-4.45},'patio'], ['patio',{x:8.1,y:.5,z:-2.5},'factory'],
    ] as const) {
      const exit=visitorBallExit(p,room)!; expect(exit.room).toBe(destination);
      expect(validBallVector(exit.position,false,exit.room)).toBe(true);
    }
    expect(visitorBallExit({x:7.7,y:.5,z:4},'factory')).toBeUndefined();
    expect(visitorBallExit({x:-7.1,y:3,z:-5.2},'factory')).toBeUndefined();
  });
  it('relays room-aware public throws while rejecting forged rooms and out-of-room positions', () => {
    const s=setup(), p={x:-10.5,y:.55,z:-3};
    s.relay.receive(s.a,{phase:'hold',room:'garage',position:p});
    expect(s.messages().at(-1)).toMatchObject({room:'garage',position:p});
    s.later(100);
    s.relay.receive(s.a,{phase:'hold',room:'admin',position:p});
    s.relay.receive(s.a,{phase:'hold',room:'factory',position:p});
    expect(s.messages()).toHaveLength(1);
    s.relay.receive(s.a,{phase:'throw',room:'garage',position:p,velocity:{x:0,y:5,z:2}});
    expect(s.messages().at(-1)).toMatchObject({phase:'throw',room:'garage'});
  });
});

it('reports rim impact separately from clean baskets and floor bounces', () => {
  const ball = (x: number, y: number): FlyingBall => ({position:{x,y,z:VISITOR_BALL_RIM.z},velocity:{x:0,y:-3,z:0},scored:false,room:'factory'});
  const hit = stepVisitorBall(ball(VISITOR_BALL_RIM.x + .13, VISITOR_BALL_RIM.y + .01), .02);
  expect(hit.rimImpact).toBeGreaterThan(0);
  expect(hit.swish).toBe(false);
  expect(stepVisitorBall(ball(VISITOR_BALL_RIM.x, VISITOR_BALL_RIM.y + .01), .02).rimImpact).toBe(0);
  expect(stepVisitorBall(ball(0, VISITOR_BALL_RADIUS + .01), .02).rimImpact).toBe(0);
});
