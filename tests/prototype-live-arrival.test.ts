import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import { toFactoryWorld } from '../shared/factory25d-layout';
import type { WorldAgent, WorldSnapshot, WSMessageToClient } from '../shared/types';
import { createLiveAgents } from '../client/prototypes/factory25dLiveAgents';
import { createAvatarStage } from '../client/prototypes/factory25dAvatarStage';

const hooks = vi.hoisted(() => ({ message: undefined as ((message: WSMessageToClient) => void) | undefined,
  connection: undefined as ((connected: boolean) => void) | undefined, labelUpdates: vi.fn(), tickets: vi.fn() }));
vi.mock('../client/prototypes/factory25dBoardData', () => ({
  onFactoryMessage: (fn: typeof hooks.message) => { hooks.message = fn; return () => { hooks.message = undefined; }; },
  onFactoryConnection: (fn: typeof hooks.connection) => { hooks.connection = fn; return () => { hooks.connection = undefined; }; },
}));
vi.mock('../client/prototypes/factory25dContributions', () => ({ watchContributions: () => ({ forUser() {}, dispose() {} }) }));
vi.mock('../client/prototypes/factory25dAvatarTexture', async () => {
  const THREE = await import('three');
  return { avatarTexture: () => ({ sheet: { feet: Array.from({ length: 9 }, () => [24, 24, 24, 24]) },
    texture: new THREE.CanvasTexture({} as HTMLCanvasElement) }), setAvatarTextureFrame() {}, installAvatarBack() {} };
});
vi.mock('../client/prototypes/factory25dLabels', () => ({ createNameTag: () => ({
  element: { dataset: {}, style: {}, classList: { toggle() {} }, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, height: 0 }) }, update: hooks.labelUpdates,
  setContribution() {}, setTickets: hooks.tickets, setDetails() {}, setAvatar() {}, setActivity() {}, dispose() {},
}) }));
vi.mock('../client/prototypes/factory25dEffects', () => ({ createFactoryEffects: () => ({
  update() {}, follow() {}, configureGarage() {}, dispose() {},
}) }));
vi.mock('../client/prototypes/factory25dTombstones', () => ({ createFactoryTombstones: () => ({ update() {}, configureGarage() {}, dispose() {} }) }));
vi.mock('../client/prototypes/factory25dContactShadows', async () => {
  const THREE = await import('three');
  return { contactShadow: (parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ opacity: .3 })); parent.add(mesh); return mesh;
  } };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); hooks.labelUpdates.mockClear(); hooks.tickets.mockClear(); });

function agent(sessionId: string, startedAt = 1000): WorldAgent {
  return { sessionId, username: sessionId, avatar: DEFAULT_AVATAR, cwd: '/factory', activity: 'idle', currentTool: null,
    subagents: [], startedAt, lastEventAt: startedAt, world: { zone: 'entrance', position: toFactoryWorld({ x: 0, z: 2 }), facing: 'down' } };
}
function world(agents: WorldAgent[], serverTime = 1000, revision = 1): WorldSnapshot {
  return { schemaVersion: 1, revision, serverTime, agents, environment: 'factory25d', tombstones: [], events: [], chat: [],
    stationTickets: { wallets: [], visits: [] } };
}

it('applies the live fall once, tracks its feet, preserves tickets, and lets controls/reconnects interrupt immediately', () => {
  let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  const scene = new THREE.Scene(), patio = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100);
  camera.position.set(0, 4, 10); camera.lookAt(0, 1, 0);
  const canvas = { dataset: {}, parentElement: {} } as HTMLCanvasElement;
  const actors = createLiveAgents(scene, patio, canvas), occluder = new THREE.Group();
  const update = () => actors.update(now / 1000, camera, true, false, () => .018, occluder);
  actors.sync(world([agent('existing')])); update();
  expect(actors.isPerforming('existing')).toBe(false);
  now = 1200;
  const fresh = agent('fresh', now), next = world([agent('existing'), fresh], now, 2);
  actors.sync(next);
  hooks.message?.({ type: 'effect', sessionId: 'fresh', effect: 'session_start' });
  update();
  const entry = actors.entries.get('fresh')!;
  expect(entry.mesh.position.y - entry.baseHeight - .018).toBeCloseTo(1.8);
  expect(entry.mesh.scale.toArray()).toEqual([1, 1, 1]);
  expect(entry.label.element.dataset.performing).toBe('arriving');
  expect(entry.shadow.position.y).toBeCloseTo(.021);
  expect(actors.isPerforming('fresh')).toBe(true);
  const labelCall = hooks.labelUpdates.mock.calls.findLast(args => args[0] === entry.mesh)!;
  expect(labelCall[6]).toBe(entry.labelFeet);
  expect(hooks.tickets).toHaveBeenCalledWith(0);
  now += 200; update();
  expect(entry.mesh.position.y - entry.baseHeight - .018).toBeLessThan(1.8);
  actors.placeOverride('fresh', { x: 1, z: 2 }, 0);
  expect(actors.isPerforming('fresh')).toBe(false);
  expect(entry.mesh.position.y).toBeCloseTo(.018 + entry.baseHeight);
  expect(scene.getObjectByName('agent-arrival-landing')).toBeUndefined();
  hooks.connection?.(false);
  now = 1700; actors.sync(world([fresh, agent('while-away', now)], now, 3)); update();
  expect(actors.isPerforming('while-away')).toBe(false);
  now = 1900;
  const full = world([fresh, agent('snapshot-only', now)], now, 4);
  hooks.message?.({ type: 'world_snapshot', snapshot: full }); actors.sync(full); update();
  expect(actors.isPerforming('snapshot-only')).toBe(false);
  actors.dispose(); expect(scene.children).toHaveLength(0);
  expect(hooks.message).toBeUndefined(); expect(hooks.connection).toBeUndefined();
});

it('grounds an arriving agent before taking an avatar-editor snapshot, even when no clearance walk is needed', () => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('document', { body: { classList: { add() {}, remove() {} } }, querySelector: () => null });
  const factory = new THREE.Scene(), patio = new THREE.Scene(), garage = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
  camera.position.set(0, 9, 14.6); camera.lookAt(0, .35, .45);
  const canvas = { dataset: {}, parentElement: {}, clientWidth: 1000, clientHeight: 800 } as HTMLCanvasElement;
  const renderer = { setSize: vi.fn() } as unknown as THREE.WebGLRenderer;
  const actors = createLiveAgents(factory, patio, canvas), floor = .063;
  const update = () => actors.update(now / 1000, camera, true, false, () => floor, new THREE.Group());
  actors.sync(world([])); update();
  now = 1200;
  const fresh = { ...agent('mine', now), ownerId: 'me' };
  fresh.world.position = toFactoryWorld({ x: 3, z: 3.5 });
  actors.sync(world([fresh], now, 2)); update();
  const entry = actors.entries.get('mine')!, originalSession = structuredClone(entry.session);
  expect(entry.mesh.position.y - entry.baseHeight - floor).toBeCloseTo(1.8);
  expect(factory.getObjectByName('agent-arrival-landing')).toBeDefined();
  const stage = createAvatarStage(factory, patio, garage, actors, canvas, renderer, () => camera, () => 'mine', () => floor);
  stage.open({ ownerId: 'me' });
  expect(actors.isPerforming('mine')).toBe(false);
  expect(entry.mesh.position.y - entry.baseHeight).toBeCloseTo(floor);
  expect(entry.mesh.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  expect(factory.getObjectByName('agent-arrival-landing')).toBeUndefined();
  const draft = factory.getObjectByName('avatar-edit-draft')!;
  stage.update(now);
  expect(draft.position.x).toBeCloseTo(3); expect(draft.position.z).toBeCloseTo(3.5);
  expect(draft.position.y).toBeCloseTo(floor + (24 / 32 - .5) * .86 + .004);
  now += 1800; update(); stage.update(now);
  expect(stage.focusPoint().y).toBeCloseTo(floor + .43);
  expect(draft.position.y).toBeCloseTo(floor + (24 / 32 - .5) * .86 + .004);
  expect(entry.mesh.visible).toBe(false); expect(entry.session).toEqual(originalSession);
  stage.close(); now += 2000; update(); stage.update(now);
  expect(stage.isActive()).toBe(false); expect(entry.mesh.visible).toBe(true);
  expect(entry.mesh.position.y - entry.baseHeight).toBeCloseTo(floor);
  expect(actors.isPerforming('mine')).toBe(false); expect(entry.session).toEqual(originalSession);
  stage.dispose(); actors.dispose();
});
