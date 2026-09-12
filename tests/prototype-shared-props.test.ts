import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RoomPropsView } from '../client/prototypes/factory25dSharedProps';
import { createFixtureRock } from '../client/prototypes/factory25dFixtureRock';
import { VendingSoundEvents } from '../client/prototypes/factory25dVendingSoundEvents';
import { VendingPilePhysics } from '../shared/factory25d-vending-physics';
import type { RoomPropsState, SharedRoomLight } from '../shared/room-props';

const snapshot = (time: number, x = 0): RoomPropsState => ({
  type: 'room_props_state', epoch: 'first', revision: time, serverTime: time, lights: [], queued: 0, dispenses: 1, held: [],
  bodies: [{ id: 0, position: [x, .1, .5], quaternion: [0, 0, 0, 1], velocity: [1, 0, 0], sleeping: false, supported: false }],
  cleanup: { phase: 'walking', position: { x, z: 6 }, motion: { x: .08, z: 0 }, facing: { x: 1, z: 0 } },
});

describe('shared prop rendering', () => {
  it('interpolates the pile and clerk, applies removals immediately, and ignores stale packets', () => {
    let now = 0; const view = new RoomPropsView(() => now);
    view.push(snapshot(1000, 0)); now = 100; view.push(snapshot(1100, 1)); now = 150;
    expect(view.sampleBodies()[0].position.x).toBeCloseTo(.5);
    expect(view.cleanup()?.position.x).toBeCloseTo(.5);
    view.push(snapshot(1000, -10)); expect(view.sampleBodies()[0].position.x).toBeCloseTo(.5);
    now = 200; expect(view.sampleBodies()[0].position.x).toBe(1);
    view.push({ ...snapshot(1200), bodies: [], held: [{ sessionId: 'a', id: 0, since: 1200, from: [1, .1, .5] }] });
    expect(view.sampleBodies()).toHaveLength(0); expect(view.state?.held).toHaveLength(1);
  });
  it('snaps to a fresh snapshot after a suspended tab or server restart instead of sweeping old props through the room', () => {
    let now = 0; const view = new RoomPropsView(() => now); view.push(snapshot(1000));
    now = 30_000; view.push(snapshot(31_000, 3)); expect(view.sampleBodies()[0].position.x).toBe(3);
    now += 5000; expect(view.now()).toBe(31_500);
    view.push({ ...snapshot(50, -2), epoch: 'replacement' }); expect(view.sampleBodies()[0].position.x).toBe(-2);
  });
  it('shows identical fixture poses to live and late-joining browsers and respects reduced motion', () => {
    function fixture() {
      const room = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(.3, .8, .3)); mesh.position.y = .4; room.add(mesh);
      return { room, mesh, rock: createFixtureRock([mesh])! };
    }
    const a = fixture(), b = fixture();
    const light: SharedRoomLight = { id: 'test', on: false, presses: 4, changedAt: 1000, fallenAt: 1000, recoverAt: null };
    for (let now = 1000; now <= 1700; now += 16) a.rock.sync(light, now, false);
    a.rock.sync(light, 1700, false); b.rock.sync(light, 1700, false);
    expect(a.mesh.parent!.rotation.toArray()).toEqual(b.mesh.parent!.rotation.toArray());
    expect(a.mesh.parent!.position.toArray()).toEqual(b.mesh.parent!.position.toArray());
    a.rock.sync(light, 1700, true); expect(a.rock.state).toBe('fallen');
    light.recoverAt = 2000; a.rock.sync(light, 2400, false); b.rock.sync(light, 2400, false);
    expect(a.mesh.parent!.rotation.toArray()).toEqual(b.mesh.parent!.rotation.toArray());
    light.fallenAt = light.recoverAt = null; a.rock.sync(light, 3000, false);
    expect(a.rock.state).toBe('upright'); expect(a.mesh.parent!.rotation.x).toBe(0);
    a.rock.dispose(); b.rock.dispose(); a.mesh.geometry.dispose(); b.mesh.geometry.dispose();
  });
  it('does not replay settled pile sounds on entry, but plays a newly dispensed item and its landing', () => {
    const pile = new VendingPilePhysics(), sounds = new VendingSoundEvents(); let dispenses = 0, lands = 0;
    sounds.configure({ dispense: () => dispenses++, land: () => lands++ });
    pile.dispense(); for (let i = 0; i < 1200; i++) pile.update(1 / 120);
    sounds.prime(pile.bodies); sounds.update(pile.bodies, true); expect([dispenses, lands]).toEqual([0, 0]);
    pile.dispense();
    for (let i = 0; i < 1200; i++) { pile.update(1 / 120); sounds.update(pile.bodies, true); }
    expect([dispenses, lands]).toEqual([1, 1]); sounds.dispose();
  });
});
