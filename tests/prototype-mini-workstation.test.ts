import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createMiniWorkstation } from '../client/prototypes/factory25dMiniWork';
import { createGarageCarAnimation } from '../client/prototypes/factory25dGarageCarAnimation';
import { GARAGE_CAR_BAYS, GARAGE_CAR_SCALE, GARAGE_CAR_YAW } from '../shared/factory25d-garage';
import { clearFactorySegment, GARAGE_LEVEL, MINI_WORKSTATION_SLOT, toFactoryWorld } from '../shared/factory25d-layout';
import type { createLiveAgents } from '../client/prototypes/factory25dLiveAgents';
import type { WorldAgent } from '../shared/types';

async function setup() {
  const bytes = await readFile(new URL('../client/assets/prototype25d/garage/mini.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const room = new THREE.Group(); room.position.y = GARAGE_LEVEL;
  const root = new THREE.Group(); root.add(gltf.scene); root.scale.setScalar(GARAGE_CAR_SCALE);
  root.position.set(GARAGE_CAR_BAYS.mini.x, .025, GARAGE_CAR_BAYS.mini.z); root.rotation.y = GARAGE_CAR_YAW; room.add(root);
  const session = { sessionId: 'jonathan', username: 'jonathanvergara', activity: 'reading', world: {
    zone: 'work', slotIndex: MINI_WORKSTATION_SLOT, position: toFactoryWorld({ x: .95, z: 26.4 }), facing: 'up', miniWork: { startedAt: 1000 },
  } } as WorldAgent;
  let now = 1000;
  const poseGarageWorker = vi.fn();
  const actors = { entries: new Map([['jonathan', { session }]]), serverNow: () => now, poseGarageWorker, isPerforming: () => false } as unknown as ReturnType<typeof createLiveAgents>;
  const cars = new Map([['mini', root]]), visits = createGarageCarAnimation(cars), work = createMiniWorkstation(room, cars);
  work.configure(actors); visits.configure(actors);
  const update = (time: number) => { now = time; visits.update(true, false); work.update(false); };
  return { root, room, session, work, update, poseGarageWorker };
}

describe('Mini laptop workstation', () => {
  it('takes the laptop through the actual door and keeps the walk clear of the parked body', async () => {
    const { root, work, update, poseGarageWorker } = await setup();
    let door: THREE.Object3D | undefined;
    root.traverse(node => { if (node.userData.role === 'door' && node.name.startsWith('door_left')) door = node; });
    let previous = { x: .95, z: 26.4 };
    for (let time = 1000; time <= 5300; time += 100) {
      update(time);
      const point = poseGarageWorker.mock.lastCall![1];
      expect(clearFactorySegment(previous, point)).toBe(true);
      previous = point;
    }
    update(3200); expect(door!.rotation.y).toBeGreaterThan(.9); expect(work.laptop.visible).toBe(false);
    update(3700); expect(work.laptop.visible).toBe(true); expect(work.stand.visible).toBe(false);
    update(7000);
    expect(door!.rotation.y).toBe(0);
    expect(work.stand.visible).toBe(true);
    expect(work.laptop.position.y).toBeCloseTo(.355);
    expect(poseGarageWorker.mock.lastCall!.slice(1, 4)).toEqual([{ x: expect.closeTo(.95), z: expect.closeTo(26.4) }, false, true]);
    work.dispose(); expect(work.props.parent).toBeNull();
  });

  it('packs away after work and cancels immediately for manual control', async () => {
    const { session, work, update } = await setup();
    update(7000); expect(work.props.visible).toBe(true);
    session.activity = 'idle'; session.world.miniWork = { startedAt: 1000, packingAt: 8000 };
    update(8000); expect(work.props.visible).toBe(true);
    update(10100); expect(work.stand.visible).toBe(false);
    update(12600); expect(work.props.visible).toBe(false);
    session.activity = 'reading'; session.world.miniWork = { startedAt: 13000 };
    update(19000); expect(work.props.visible).toBe(true);
    session.manualControl = { ...session.world.position, facing: 'down', moving: false };
    update(19100); expect(work.props.visible).toBe(false);
  });

  it('does not turn another agent or an idle Mini visitor into Jonathan working', async () => {
    const { session, work, update, poseGarageWorker } = await setup();
    session.username = 'jonathan'; update(7000); expect(work.props.visible).toBe(false); expect(poseGarageWorker).not.toHaveBeenCalled();
    session.username = 'jonathanvergara'; session.activity = 'idle'; update(8000); expect(work.props.visible).toBe(false);
  });

  it('joins an in-progress pack from the shared clock without replaying the setup', async () => {
    const { session, work, update } = await setup();
    session.activity = 'idle'; session.world.miniWork = { startedAt: 1000, packingAt: 8000 };
    update(10300);
    expect(work.phase()).toBe('packing the laptop away');
    expect(work.stand.visible).toBe(false);
    update(12600); expect(work.props.visible).toBe(false);
  });
});
