import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import { avatarBodyFrame } from '../client/prototypes/factory25dAvatarTexture';

vi.mock('../client/rendering/avatarPainter', async importOriginal => ({
  ...await importOriginal<typeof import('../client/rendering/avatarPainter')>(), drawCharacter: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('document', {
    body: { classList: { add() {}, remove() {} } }, querySelector: () => null,
    createElement: () => ({ width: 0, height: 0, getContext: () => ({
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height / 32; row++) for (let frame = 0; frame < 4; frame++)
          data[((row * 32 + 25 + frame) * width + frame * 32) * 4 + 3] = 255;
        return { data };
      },
    }) }),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('shared avatar artwork', () => {
  it('reuses identical resolved looks, but repaints changed appearances and animation sets', async () => {
    const { avatarSheet, AVATAR_ANIMATIONS } = await import('../client/prototypes/factory25dAvatar');
    const { drawCharacter } = await import('../client/rendering/avatarPainter');
    vi.mocked(drawCharacter).mockClear();
    const avatar = { ...DEFAULT_AVATAR }, sheet = avatarSheet(avatar);
    expect(drawCharacter).toHaveBeenCalledTimes(AVATAR_ANIMATIONS.length * 4);
    expect(avatarSheet({ ...avatar })).toBe(sheet);
    expect(drawCharacter).toHaveBeenCalledTimes(AVATAR_ANIMATIONS.length * 4);
    expect(sheet.feet.every(row => row.join() === '26,27,28,29')).toBe(true);
    avatar.shirtColor = '#abcdef'; expect(avatarSheet(avatar)).not.toBe(sheet);
    const portrait = avatarSheet(DEFAULT_AVATAR, ['idle']);
    expect(portrait.canvas.height).toBe(32); expect(portrait.feet).toEqual([[26, 27, 28, 29]]);
    expect(avatarSheet(DEFAULT_AVATAR, ['climb'])).not.toBe(portrait);
  });

  it('bounds color-picker cache growth while preserving recently used looks', async () => {
    const { avatarSheet } = await import('../client/prototypes/factory25dAvatar');
    const looks = Array.from({ length: 33 }, (_, i) => ({ ...DEFAULT_AVATAR, shirtColor: `#${i.toString(16).padStart(6, '0')}` }));
    const first = avatarSheet(looks[0]), second = avatarSheet(looks[1]);
    looks.slice(2, 32).forEach(look => avatarSheet(look));
    expect(avatarSheet(looks[0])).toBe(first);
    avatarSheet(looks[32]);
    expect(avatarSheet(looks[0])).toBe(first); expect(avatarSheet(looks[1])).not.toBe(second);
  });

  it('shares pixels without coupling animation offsets or texture disposal between agents', async () => {
    const { avatarTexture } = await import('../client/prototypes/factory25dAvatarTexture');
    const a = avatarTexture(DEFAULT_AVATAR), b = avatarTexture(DEFAULT_AVATAR);
    expect(a.sheet).toBe(b.sheet); expect(a.texture).not.toBe(b.texture);
    a.texture.offset.set(.5, .25); expect(b.texture.offset.toArray()).toEqual([0, 0]);
    const dispose = vi.fn(); b.texture.addEventListener('dispose', dispose);
    a.texture.dispose(); expect(dispose).not.toHaveBeenCalled();
    expect(b.texture.image).toBe(b.sheet.canvas); expect(b.texture.minFilter).toBe(THREE.NearestFilter);
    b.texture.dispose();
  });
});

describe('in-room avatar camera', () => {
  async function setup(downstairs=false, seated=false) {
    const { createAvatarStage } = await import('../client/prototypes/factory25dAvatarStage');
    const factory = new THREE.Scene(), patio = new THREE.Scene(), garage = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
    camera.position.set(0, 9, 14.6); camera.lookAt(0, .35, .45);
    const canvas = { clientWidth: 1000, clientHeight: 800 }, renderer = { setSize: vi.fn() };
    const mesh = new THREE.Object3D(); mesh.position.set(1, downstairs ? -11.5 : .5, .6); (downstairs ? garage : factory).add(mesh);
    const shadow = new THREE.Object3D(); shadow.visible = false;
    const entry = { mesh, shadow, seatBlend: Number(seated), baseHeight: .48, session: { sessionId: 'mine', ownerId: 'me', avatar: DEFAULT_AVATAR } };
    if (seated) {
      mesh.position.set(.88, .018 + .48 + entry.baseHeight, 10.06);
      const chair = new THREE.Mesh(new THREE.BoxGeometry(1.12, .9, 1.14), new THREE.MeshBasicMaterial());
      chair.position.set(.78, .45, 10.09); factory.add(chair);
    }
    const agents = { entries: new Map([['mine', entry]]) };
    const stage = createAvatarStage(factory, patio, garage, agents as unknown as Parameters<typeof createAvatarStage>[3],
      canvas as HTMLCanvasElement, renderer as unknown as THREE.WebGLRenderer, () => camera, () => 'mine');
    let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
    stage.open({ ownerId: 'me' });
    return { stage, camera, canvas, renderer, mesh, entry, factory, garage, tick(time: number) { now = time; stage.update(now); } };
  }

  it('edits a downstairs agent in the garage and restores it on close', async () => {
    const {stage,garage,mesh,tick}=await setup(true);
    tick(1900);expect(stage.scene()).toBe(garage);expect(stage.focusPoint().y).toBeLessThan(-11);
    expect(garage.getObjectByName('avatar-edit-draft')).toBeDefined();expect(mesh.visible).toBe(false);
    stage.close();tick(3000);expect(mesh.visible).toBe(true);expect(garage.children).toEqual([mesh]);stage.dispose();
  });

  it('starts the walk preview on its own contact frame and holds that frame when stopped', async () => {
    const { stage, factory, tick } = await setup();
    tick(15_000); stage.pose(1, true); tick(15_000);
    const model = factory.getObjectByName('avatar-edit-draft') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    expect(avatarBodyFrame(model.material.map!)).toBe(0);
    tick(15_160); expect(avatarBodyFrame(model.material.map!)).toBe(1);
    stage.pose(2, true); tick(15_310); expect(avatarBodyFrame(model.material.map!)).toBe(3);
    stage.pose(2, false); tick(15_500); expect(avatarBodyFrame(model.material.map!)).toBe(0);
    stage.dispose();
  });

  it('stops rebuilding the settled camera, then reframes after a viewport resize', async () => {
    const { stage, renderer, canvas, tick } = await setup();
    const clones = vi.spyOn(THREE.OrthographicCamera.prototype, 'clone');
    tick(1000); tick(1900);
    const projection = vi.spyOn(stage.camera, 'updateProjectionMatrix');
    for (let i = 0; i < 60; i++) tick(2000 + i * 16);
    expect(clones).not.toHaveBeenCalled(); expect(projection).not.toHaveBeenCalled();
    expect(renderer.setSize).toHaveBeenCalledOnce();
    canvas.clientWidth = 390; canvas.clientHeight = 844; tick(3000);
    expect(renderer.setSize).toHaveBeenCalledTimes(2); expect(projection).toHaveBeenCalledOnce();
    expect(stage.camera.top - stage.camera.bottom).toBeCloseTo(2.55);
    stage.dispose();
  });

  it('returns to the original framing and restores the real agent after an interrupted zoom', async () => {
    const { stage, mesh, factory, camera, tick } = await setup();
    tick(1100); expect(mesh.visible).toBe(false);
    stage.close(); tick(2000);
    expect(stage.isActive()).toBe(false); expect(mesh.visible).toBe(true);
    expect(stage.camera.position.distanceTo(camera.position)).toBeLessThan(1e-9);
    expect(stage.camera.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    expect(factory.children).toEqual([mesh]); stage.dispose();
  });

  it('walks a seated draft off the chair before the close-up, then walks back without changing the live agent', async () => {
    const { stage, mesh, entry, factory, camera, tick } = await setup(false, true);
    const original = mesh.position.clone(), session = structuredClone(entry.session);
    const model = factory.getObjectByName('avatar-edit-draft') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    tick(1000); expect(model.position.x).toBeCloseTo(original.x);
    tick(1200);
    expect(model.position.x).toBeGreaterThan(original.x); expect(model.position.x).toBeLessThan(1.5);
    expect(model.position.y).toBeLessThan(original.y);
    expect(stage.camera.position.distanceTo(camera.position)).toBeLessThan(1e-9);
    tick(4000);
    expect(model.position.x).toBeGreaterThan(1.5); expect(model.position.y).toBeLessThan(.5);
    expect(stage.focusPoint().y).toBeCloseTo(.018 + .43);
    expect(mesh.position).toEqual(original); expect(entry.session).toEqual(session);
    expect(mesh.visible).toBe(false); expect(entry.shadow.visible).toBe(false);
    stage.close(); tick(4200); expect(stage.isActive()).toBe(true);
    tick(7000); expect(stage.isActive()).toBe(false); expect(mesh.visible).toBe(true);
    expect(entry.shadow.visible).toBe(false); expect(mesh.position).toEqual(original); stage.dispose();
  });

  it('can cancel while stepping off the chair and reopen without leaving a duplicate avatar', async () => {
    const { stage, mesh, factory, tick } = await setup(false, true);
    tick(1100); stage.close(); tick(4000);
    expect(stage.isActive()).toBe(false); expect(mesh.visible).toBe(true);
    stage.open({ ownerId:'me' }); tick(4200); stage.open({ ownerId:'me' }); tick(8000);
    expect(factory.children.filter(child => child.name === 'avatar-edit-draft')).toHaveLength(1);
    stage.dispose(); expect(mesh.visible).toBe(true);
    expect(factory.children.some(child => child.name === 'avatar-edit-draft')).toBe(false);
  });

  it('returns to the current live position when the agent moves during editing', async () => {
    const { stage, mesh, factory, tick } = await setup();
    tick(2000); mesh.position.x = 2.5;
    stage.close(); tick(2300);
    const model = factory.getObjectByName('avatar-edit-draft')!;
    expect(model.position.x).toBeGreaterThan(1); expect(model.position.x).toBeLessThan(2.5);
    tick(5000); expect(mesh.position.x).toBe(2.5); expect(mesh.visible).toBe(true); stage.dispose();
  });

  it('keeps a reduced-motion edit accessible without the walk or zoom animation', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches:true }));
    const { stage, mesh, factory, tick } = await setup(false, true);
    tick(1000);
    expect(factory.getObjectByName('avatar-edit-draft')!.position.x).toBeGreaterThan(1.5);
    expect(stage.camera.top - stage.camera.bottom).toBeCloseTo(2.75);
    stage.close(); tick(1000); expect(stage.isActive()).toBe(false); expect(mesh.visible).toBe(true); stage.dispose();
  });
});

describe('avatar editor furniture clearance', () => {
  it('moves out from a real mesh occluder even when the floor underneath is walkable', async () => {
    const { avatarClearanceRoute } = await import('../client/prototypes/factory25dAvatarClearance');
    const { clearFactorySegment } = await import('../shared/factory25d-layout');
    const scene = new THREE.Scene(), origin = { x:3, z:3.5 };
    expect(avatarClearanceRoute(scene, 'factory', origin, false, () => .018)).toEqual([]);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.1, .3), new THREE.MeshBasicMaterial());
    blocker.position.set(3, .55, 4.1); scene.add(blocker);
    const path = avatarClearanceRoute(scene, 'factory', origin, false, () => .018);
    expect(path.length).toBeGreaterThan(0);
    let previous = origin;
    for (const point of path) { expect(clearFactorySegment(previous, point)).toBe(true); previous = point; }
    expect(avatarClearanceRoute(scene, 'factory', previous, false, () => .018)).toEqual([]);
    blocker.geometry.dispose(); blocker.material.dispose();
  });

  it('uses the lower floor coordinates when a garage prop obstructs the close-up', async () => {
    const { avatarClearanceRoute } = await import('../client/prototypes/factory25dAvatarClearance');
    const scene = new THREE.Scene(), origin = { x:0, z:32 };
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.1, .3), new THREE.MeshBasicMaterial());
    blocker.position.set(0, -11.45, 8.6); scene.add(blocker);
    const path = avatarClearanceRoute(scene, 'garage', origin, false, () => -11.982);
    expect(path.length).toBeGreaterThan(0); expect(path.every(point => point.z > 24)).toBe(true);
    expect(avatarClearanceRoute(scene, 'garage', path.at(-1)!, false, () => -11.982)).toEqual([]);
    blocker.geometry.dispose(); blocker.material.dispose();
  });
});
