import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGarageDriveVisuals, GARAGE_VISUAL_MARK_LIMIT } from '../client/prototypes/factory25dGarageDriveVisuals';
import { GARAGE_CAR_IDS, GARAGE_CAR_SCALE, type GarageCarId } from '../shared/factory25d-garage';
import type { GarageDriveCar, GarageTireMark } from '../shared/factory25d-driving';

async function model(id: GarageCarId) {
  const bytes = await readFile(new URL(`../client/assets/prototype25d/garage/${id}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const root = new THREE.Group(); root.add(gltf.scene); root.scale.setScalar(GARAGE_CAR_SCALE); return root;
}
function state(id: GarageCarId, fields: Partial<GarageDriveCar> = {}): GarageDriveCar {
  return { id, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, steer: 0, slip: 0, throttle: 0, damage: 0, mode: 'driving', ...fields };
}
function mark(id: number, fields: Partial<GarageTireMark> = {}): GarageTireMark {
  return { id, car: 'mini', x1: id / 100, z1: 4, x2: id / 100, z2: 4.2, width: .05, opacity: .5, createdAt: 1_800_000_000_000, ...fields };
}
function role(root: THREE.Object3D, wanted: string) {
  const found: THREE.Object3D[] = []; root.traverse(node => { if (node.userData.role === wanted) found.push(node); }); return found;
}
function tireMesh(room: THREE.Group) { return room.getObjectByName('garage-tire-marks') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; }

describe('garage driving visuals on the actual authored cars', () => {
  it('rolls all four models by traveled distance / measured radius and keeps tire contacts, shadows and outer poses fixed', async () => {
    for (const id of GARAGE_CAR_IDS) {
      const root = await model(id), room = new THREE.Group(); room.add(root);
      root.position.set(2, .025, 3); root.rotation.y = .4;
      const shadow = new THREE.Object3D(); root.add(shadow); shadow.position.y = -.014;
      const outer = root.matrix.clone(); root.updateMatrix(); outer.copy(root.matrix);
      const wheels = role(root, 'wheel'), before = wheels.map(wheel => wheel.getWorldPosition(new THREE.Vector3()));
      for (const wheel of wheels) {
        const tire = wheel.children.find(child => child.name.startsWith('tire_'))!;
        // Blender's cylinder Y axis really maps to the wheel's +X axle in every shipped GLB.
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(tire.quaternion).x).toBeCloseTo(1, 5);
      }
      const visuals = createGarageDriveVisuals(room, new Map([[id, root]]));
      visuals.poseCar(state(id, { vz: .7 })); visuals.update(.1);
      for (const [i, wheel] of wheels.entries()) {
        const expected = .07 / (Number(wheel.userData.radius) * GARAGE_CAR_SCALE);
        expect(wheel.rotation.x).toBeCloseTo(expected, 5);
        expect(wheel.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-7);
        expect(wheel.parent!.parent!.userData.role).toBe('vehicle');
      }
      root.updateMatrix(); expect(root.matrix.equals(outer)).toBe(true);
      expect(shadow.parent).toBe(root); expect(shadow.position.y).toBe(-.014);
      visuals.dispose();
    }
  });

  it('steers only the front wheels with a tighter inner angle, constrains body motion, and pauses/reduces decorative motion', async () => {
    const root = await model('mini'), room = new THREE.Group(); room.add(root);
    const visuals = createGarageDriveVisuals(room, new Map([['mini', root]]));
    visuals.poseCar(state('mini', { vz: 5, steer: .7, slip: .65 }));
    for (let i = 0; i < 120; i++) visuals.update(1 / 60);
    const steering = role(root, 'steering'), front = steering.filter(node => node.userData.axle === 'front');
    const inner = front.find(node => node.position.x > 0)!, outer = front.find(node => node.position.x < 0)!;
    expect(inner.rotation.y).toBeGreaterThan(outer.rotation.y); expect(inner.rotation.y).toBeLessThanOrEqual(.98);
    for (const rear of steering.filter(node => node.userData.axle === 'rear')) expect(rear.rotation.y).toBe(0);
    const body = root.getObjectByName('garage-driving-body')!, wheel = role(root, 'wheel')[0];
    expect(body.rotation.z).toBeGreaterThan(.01); expect(body.rotation.z).toBeLessThanOrEqual(.024);
    expect(Math.abs(body.rotation.x)).toBeLessThanOrEqual(.018);
    const stopped = wheel.quaternion.clone(), tilt = body.quaternion.clone();
    visuals.poseCar(state('mini', { vz: -3, steer: -.7, damage: .8 }));
    visuals.update(20, { visible: false });
    expect(wheel.quaternion.equals(stopped)).toBe(true); expect(body.quaternion.equals(tilt)).toBe(true);
    visuals.update(.1, { reducedMotion: true });
    expect(wheel.quaternion.equals(stopped)).toBe(true); expect(body.rotation.x).toBe(0); expect(body.rotation.z).toBe(0);
    // Steering remains useful feedback with reduced motion; arbitrary input cannot exceed physical limits.
    visuals.poseCar(state('mini', { vz: 1e10, steer: 1e10, slip: -1e10 }));
    for (let i = 0; i < 200; i++) visuals.update(.1);
    expect(Math.abs(body.rotation.z)).toBeLessThanOrEqual(.024); expect(Math.abs(body.rotation.x)).toBeLessThanOrEqual(.018);
    for (const node of front) expect(Math.abs(node.rotation.y)).toBeLessThanOrEqual(.98);
    visuals.poseCar(state('mini', { mode: 'parked' }));
    for (let i = 0; i < 180; i++) visuals.update(1 / 60);
    expect(Math.abs(body.rotation.z)).toBeLessThan(1e-7); expect(Math.abs(body.rotation.x)).toBeLessThan(1e-7);
    expect(Math.abs(front[0].rotation.y)).toBeLessThan(1e-7);
    visuals.dispose();
  });

  it('isolates damage tint from shared GLB materials and restores the authored graph, door hinges and material ownership on disposal', async () => {
    const root = await model('mini'), room = new THREE.Group(); room.add(root);
    const vehicle = role(root, 'vehicle')[0], originalChildren = [...vehicle.children];
    const bodyMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    root.getObjectByName('green_body')!.traverse(node => {
      if (node instanceof THREE.Mesh && node.material.name === 'Mini · racing green') bodyMeshes.push(node);
    });
    const paintMesh = bodyMeshes[0];
    const originalPaint = paintMesh.material, originalColor = originalPaint.color.clone();
    const unmodifiedCopy = root.clone(true), copyPaint = (unmodifiedCopy.getObjectByName(paintMesh.name) as THREE.Mesh).material;
    expect(copyPaint).toBe(originalPaint);
    const originalPositions = originalChildren.map(child => child.position.clone());
    const door = role(root, 'door')[0]; door.rotation.y = .45;
    const visuals = createGarageDriveVisuals(room, new Map([['mini', root]]));
    visuals.poseCar(state('mini', { damage: 1, vz: 1, steer: .5 })); visuals.update(.1);
    const privatePaint = paintMesh.material, privateDispose = vi.fn(), originalDispose = vi.fn();
    privatePaint.addEventListener('dispose', privateDispose); originalPaint.addEventListener('dispose', originalDispose);
    expect(privatePaint).not.toBe(originalPaint); expect(privatePaint.color.equals(originalColor)).toBe(false);
    expect(originalPaint.color.equals(originalColor)).toBe(true); expect(door.rotation.y).toBe(.45);
    expect(role(root, 'driver_socket')[0].parent!.name).toBe('garage-driving-body');
    expect(role(root, 'entry_socket')[0].parent).toBe(vehicle);
    visuals.dispose(); visuals.dispose();
    expect(paintMesh.material).toBe(originalPaint); expect(privateDispose).toHaveBeenCalledTimes(1); expect(originalDispose).not.toHaveBeenCalled();
    expect(vehicle.children).toHaveLength(originalChildren.length);
    for (const [i, child] of originalChildren.entries()) {
      expect(child.parent).toBe(vehicle); expect(child.position.distanceTo(originalPositions[i])).toBeLessThan(1e-8);
    }
    expect(door.rotation.y).toBe(.45); expect(root.getObjectByName('garage-driving-body')).toBeUndefined();
  });
});

describe('DeLorean hover pods on the authored GLB', () => {
  it('folds progressively from authoritative height, with both outside rim faces down and no root movement', async () => {
    const root = await model('delorean'), room = new THREE.Group(); room.add(root);
    root.position.set(3, 1.475, 5); root.rotation.y = .4; root.updateMatrix();
    const outer = root.matrix.clone(), wheels = role(root, 'wheel');
    const positions = wheels.map(wheel => wheel.parent!.position.clone());
    const tires = wheels.map(wheel => wheel.children.find(child => child.name.startsWith('tire_'))!);
    const authoredTires = tires.map(tire => tire.quaternion.clone());
    const visuals = createGarageDriveVisuals(room, new Map([['delorean', root]]));
    for (const [height, expectedDown] of [[.725, -Math.SQRT1_2], [1.45, -1]]) {
      visuals.poseCar(state('delorean', { hoverHeight: height })); visuals.update(.016, { reducedMotion: true });
      for (const [i, wheel] of wheels.entries()) {
        const steering = wheel.parent!, side = Math.sign(positions[i].x);
        const outside = new THREE.Vector3(side, 0, 0).applyQuaternion(steering.quaternion);
        expect(outside.y).toBeCloseTo(expectedDown, 6);
        expect(Math.abs(steering.position.x)).toBeGreaterThan(Math.abs(positions[i].x));
        expect(steering.position.y).toBeLessThan(positions[i].y);
        expect(steering.position.z).toBe(positions[i].z);
        expect(tires[i].quaternion.equals(authoredTires[i])).toBe(true);
      }
      root.updateMatrix(); expect(root.matrix.equals(outer)).toBe(true);
    }
    // The articulated pods stay above the tallest other car (Mini: .8775m)
    // at the authoritative 1.45m hover height, even below the original root.
    expect(new THREE.Box3().setFromObject(root).min.y).toBeGreaterThan(1.35);
    visuals.dispose();
  });

  it('restores exact ground transforms on parking and disposes only its private circuit glow', async () => {
    const root = await model('delorean'), room = new THREE.Group(); room.add(root);
    const wheels = role(root, 'wheel'), steering = wheels.map(wheel => wheel.parent!);
    const rotations = wheels.map(wheel => wheel.quaternion.clone()), pivots = steering.map(node => node.quaternion.clone());
    const positions = steering.map(node => node.position.clone());
    const circuit = root.getObjectByName('flux_Y') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const source = circuit.material, sourceIntensity = source.emissiveIntensity, sourceDispose = vi.fn();
    source.addEventListener('dispose', sourceDispose);
    const visuals = createGarageDriveVisuals(room, new Map([['delorean', root]]));
    visuals.poseCar(state('delorean', { vz: 2, steer: .6 })); visuals.update(.1);
    expect(wheels[0].quaternion.equals(rotations[0])).toBe(false);
    visuals.poseCar(state('delorean', { vz: 2, steer: .6, hoverHeight: 1.45 })); visuals.update(.1);
    const glow = circuit.material, glowDispose = vi.fn(); glow.addEventListener('dispose', glowDispose);
    expect(glow).not.toBe(source); expect(glow.emissiveIntensity).toBeGreaterThan(sourceIntensity);
    expect(source.emissiveIntensity).toBe(sourceIntensity);
    visuals.poseCar(state('delorean', { mode: 'parked', hoverHeight: 1.45 })); visuals.update(.016);
    for (const [i, wheel] of wheels.entries()) {
      expect(wheel.quaternion.equals(rotations[i])).toBe(true);
      expect(steering[i].quaternion.equals(pivots[i])).toBe(true);
      expect(steering[i].position.equals(positions[i])).toBe(true);
    }
    expect(glow.emissiveIntensity).toBe(sourceIntensity);
    // Dispose while airborne as well: no transformed pivots or private
    // materials can be left attached to the shared model after teardown.
    visuals.poseCar(state('delorean', { hoverHeight: 1.45 })); visuals.update(.1);
    visuals.dispose(); visuals.dispose();
    for (const [i, wheel] of wheels.entries()) {
      expect(wheel.quaternion.equals(rotations[i])).toBe(true);
      expect(steering[i].quaternion.equals(pivots[i])).toBe(true);
      expect(steering[i].position.equals(positions[i])).toBe(true);
    }
    expect(circuit.material).toBe(source); expect(glowDispose).toHaveBeenCalledTimes(1);
    expect(sourceDispose).not.toHaveBeenCalled(); expect(root.getObjectByName('garage-driving-body')).toBeUndefined();
  });

  it('removes decorative hover bob and bank for reduced motion while preserving the flying state', async () => {
    const root = await model('delorean'), room = new THREE.Group(); room.add(root);
    const visuals = createGarageDriveVisuals(room, new Map([['delorean', root]]));
    visuals.poseCar(state('delorean', { hoverHeight: 1.45, vz: 4, steer: .6 })); visuals.update(.1);
    const body = root.getObjectByName('garage-driving-body')!, first = body.position.y;
    visuals.update(.1); expect(body.position.y).not.toBe(first); expect(body.rotation.z).not.toBe(0);
    const steering = role(root, 'steering'), folded = steering.map(node => node.quaternion.clone());
    visuals.update(.1, { reducedMotion: true });
    expect(body.rotation.x).toBe(0); expect(body.rotation.z).toBe(0); expect(body.position.y).toBeCloseTo(.305, 6);
    for (const [i, node] of steering.entries()) expect(node.quaternion.angleTo(folded[i])).toBeLessThan(1e-7);
    const held = body.position.clone(); visuals.update(.1, { reducedMotion: true }); expect(body.position.equals(held)).toBe(true);
    visuals.dispose();
  });

  it('leaves every other car on its authored wheels even if given a hover field', async () => {
    for (const id of ['porsche', 'mini', 'f1'] as const) {
      const root = await model(id), room = new THREE.Group(); room.add(root);
      const steering = role(root, 'steering'), before = steering.map(node => node.matrix.clone());
      const visuals = createGarageDriveVisuals(room, new Map([[id, root]]));
      visuals.poseCar(state(id, { hoverHeight: 1.45 })); visuals.update(.1);
      for (const [i, node] of steering.entries()) { node.updateMatrix(); expect(node.matrix.equals(before[i])).toBe(true); }
      expect(root.getObjectByName('garage-driving-body')!.rotation.z).toBe(0);
      visuals.dispose();
    }
  });
});

describe('bounded, server-authored rubber marks', () => {
  it('retains the newest 512 received segments in one fixed geometry, handles snapshots without duplicate uploads and rejects invalid geometry', () => {
    const room = new THREE.Group(), visuals = createGarageDriveVisuals(room, new Map());
    const mesh = tireMesh(room), positions = mesh.geometry.getAttribute('position'), array = positions.array;
    const newest = Array.from({ length: 900 }, (_, i) => mark(i + 1));
    for (let i = 0; i < newest.length; i += 30) visuals.appendMarks(newest.slice(i, i + 30));
    visuals.update(.016);
    expect(visuals.markCount).toBe(GARAGE_VISUAL_MARK_LIMIT); expect(mesh.geometry.drawRange.count).toBe(512 * 6);
    expect(positions.count).toBe(512 * 4); expect(mesh.geometry.getAttribute('position').array).toBe(array);
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeCloseTo(.022, 7);
      expect(positions.getX(i)).toBeGreaterThan(3.85); expect(positions.getX(i)).toBeLessThan(9.1);
    }
    const version = positions.version;
    visuals.replaceMarks(newest); visuals.update(.016);
    expect(positions.version).toBe(version);
    visuals.appendMarks([mark(900), mark(901, { x2: NaN }), mark(902, { z2: 4 }), mark(903, { width: -1 })]); visuals.update(.016);
    expect(positions.version).toBe(version); expect(visuals.markCount).toBe(512);
    visuals.replaceMarks([mark(901)]); visuals.update(.016);
    expect(visuals.markCount).toBe(1); expect(mesh.geometry.drawRange.count).toBe(6);
    expect(mesh.material.depthWrite).toBe(false); expect(mesh.material.polygonOffset).toBe(true); expect(mesh.material.roughness).toBe(1);
    visuals.replaceMarks([]); expect(visuals.markCount).toBe(0); expect(mesh.geometry.drawRange.count).toBe(0);
    visuals.dispose(); expect(room.children).toHaveLength(0);
  });

  it('keeps timestamp precision for the shader fade without rewriting track geometry as server time advances', () => {
    const room = new THREE.Group(), visuals = createGarageDriveVisuals(room, new Map());
    visuals.replaceMarks([mark(1), mark(2, { createdAt: mark(1).createdAt + 125 })]);
    const mesh = tireMesh(room), shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    visuals.update(.016, { now: mark(1).createdAt + 82_500 });
    expect((shader.uniforms as Record<string, { value: number }>).garageMarkNow.value).toBe(82.5);
    expect(mesh.geometry.getAttribute('garageMarkBorn').getX(4)).toBe(.125);
    const positions = mesh.geometry.getAttribute('position'), version = positions.version;
    visuals.update(.016, { now: mark(1).createdAt + 90_000 });
    expect((shader.uniforms as Record<string, { value: number }>).garageMarkNow.value).toBe(90);
    expect(positions.version).toBe(version);
    const disposed = [vi.fn(), vi.fn(), vi.fn()];
    mesh.geometry.addEventListener('dispose', disposed[0]); mesh.material.addEventListener('dispose', disposed[1]); mesh.material.alphaMap!.addEventListener('dispose', disposed[2]);
    visuals.dispose(); for (const fn of disposed) expect(fn).toHaveBeenCalledTimes(1);
  });
});
