import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { WorldAgent } from '../shared/types';
import { createSnackCarry, type SnackCarrier } from '../client/prototypes/factory25dSnackCarry';
import { VendingPilePhysics } from '../client/prototypes/factory25dVendingPhysics';

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });
function fixture() {
  const room = new THREE.Scene(), root = new THREE.Group(); room.add(root);
  root.position.set(-1, 0, 9); root.rotation.y = -Math.PI / 3;
  const pile = new VendingPilePhysics();
  for (let i = 0; i < 3; i++) pile.dispense();
  for (let frame = 0; frame < 1200; frame++) pile.update(1 / 120);
  const source = { root, get dispensedBodies() { return pile.bodies; }, takeDispensed: (id: number) => pile.take(id) };
  const entries: SnackCarrier[] = [], canvas = { dataset: {} as DOMStringMap };
  const carry = createSnackCarry(source, canvas, () => entries); disposers.push(() => carry.dispose());
  function agent(id: string) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), new THREE.MeshStandardMaterial());
    mesh.userData.room = 'factory'; room.add(mesh);
    const point = root.localToWorld(pile.bodies[0].position.clone()); point.x -= .2; point.y = .3;
    mesh.position.copy(point);
    const texture = new THREE.Texture(); texture.offset.set(0, 6 / 7);
    const session = { sessionId: id, activity: 'idle', world: { zone: 'idle' } } as WorldAgent;
    const entry = { mesh, texture, session }; entries.push(entry);
    disposers.push(() => { mesh.geometry.dispose(); mesh.material.dispose(); texture.dispose(); });
    return entry;
  }
  return { root, pile, entries, canvas, carry, agent };
}

describe('snack ownership and carried pixel sprites', () => {
  it('transfers a nearby floor item exactly once into a matching 2D hand prop', () => {
    const f = fixture(), a = f.agent('a'), b = f.agent('b');
    // Leave one golden chip bag, so two agents cannot both claim it.
    f.pile.take(0); f.pile.take(2);
    f.carry.update(0, true, true);
    expect(f.pile.bodies).toHaveLength(0);
    expect(a.mesh.children).toHaveLength(1); expect(b.mesh.children).toHaveLength(0);
    const snack = a.mesh.children[0] as THREE.Mesh;
    expect(snack.name).toBe('held-snack-chips');
    expect(snack.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(snack.userData.snackId).toBe(1);
    expect(f.canvas.dataset.snackPickups).toBe('1');
    f.carry.update(1); expect(f.canvas.dataset.snackPickups).toBe('1');
  });
  it('ignores workers, distant agents, hidden rooms and agents behind the machine', () => {
    const f = fixture(), a = f.agent('a');
    a.session.activity = 'writing'; f.carry.update(0); expect(f.pile.bodies).toHaveLength(3);
    a.session.activity = 'idle'; f.carry.update(1, false); expect(f.pile.bodies).toHaveLength(3);
    a.mesh.userData.room = 'garage'; f.carry.update(2); expect(f.pile.bodies).toHaveLength(3);
    a.mesh.userData.room = 'factory'; a.mesh.position.x -= 3;
    f.carry.update(3); expect(f.pile.bodies).toHaveLength(3);
    a.mesh.position.copy(f.root.localToWorld(new THREE.Vector3(0, .3, .3)));
    f.carry.update(4); expect(f.pile.bodies).toHaveLength(3);
  });
  it('follows turns, room reparenting and avatar replacement, then clears when work starts', () => {
    const f = fixture(), a = f.agent('a'); f.carry.update(0); f.carry.update(1);
    const snack = a.mesh.children[0], right = snack.position.x;
    a.texture.offset.set(.25, 1 - 3 / 7); f.carry.update(2);
    expect(snack.position.x).toBeLessThan(0); expect(right).toBeGreaterThan(0);
    const garage = new THREE.Scene(); garage.add(a.mesh); a.mesh.userData.room = 'garage';
    f.carry.update(3, false); expect(snack.parent).toBe(a.mesh);
    const replacement = a.mesh.clone(false); garage.add(replacement); a.mesh = replacement;
    f.carry.update(4, false); expect(snack.parent).toBe(replacement);
    a.session.activity = 'reading'; f.carry.update(5);
    expect(snack.parent).toBeNull(); expect(f.canvas.dataset.carriedSnacks).toBe('0');
  });
  it('lets a controlled agent carry, cleans up departures and limits repeat pickups', () => {
    const f = fixture(), a = f.agent('a');
    a.session.activity = 'reading'; a.session.manualControl = {x:0,y:0,facing:'down',moving:false};
    f.carry.update(0); expect(f.canvas.dataset.carriedSnacks).toBe('1');
    f.carry.update(22); expect(f.canvas.dataset.carriedSnacks).toBe('0');
    f.carry.update(23); expect(f.canvas.dataset.snackPickups).toBe('1');
    // After release, remaining floor objects settle before they can be collected.
    for (let i = 0; i < 1200; i++) f.pile.update(1 / 120);
    f.carry.update(35); expect(f.canvas.dataset.snackPickups).toBe('2');
    const snack = a.mesh.children[0]; f.entries.length = 0; f.carry.update(36);
    expect(snack.parent).toBeNull(); expect(f.canvas.dataset.carriedSnacks).toBe('0');
  });
});
