import * as THREE from 'three';
import { FACTORY_ELEVATOR, GARAGE_ELEVATOR, GARAGE_LEVEL } from '@shared/factory25d-layout';
import { propPart, standard } from './factory25dProps';

// The wider garage uses its own room origin. Align the two lift shafts while
// showing the building together, then rebase the settled garage and camera equally.
export const GARAGE_SECTION_X = FACTORY_ELEVATOR.x - GARAGE_ELEVATOR.x;
const destination = new THREE.OrthographicCamera();

/** Lift the cutaway upper storey clear of the lower windows as the camera descends. */
export function upperFloorLift(progress: number) {
  const t = THREE.MathUtils.clamp(progress,0,1);
  return 11*t*t*(3-2*t);
}

export function floorTravelCamera(camera: THREE.OrthographicCamera, home: THREE.OrthographicCamera, garage01: number, section: boolean) {
  const t = THREE.MathUtils.clamp(garage01, 0, 1), shift = section ? GARAGE_SECTION_X : 0;
  destination.copy(home);
  destination.position.set(shift, GARAGE_LEVEL + 18.94, 23.8);
  destination.lookAt(shift, GARAGE_LEVEL + 1.57, 5.8);
  destination.zoom = .66;
  camera.copy(home);
  camera.position.lerpVectors(home.position, destination.position, t);
  camera.quaternion.slerpQuaternions(home.quaternion, destination.quaternion, t);
  camera.zoom = THREE.MathUtils.lerp(home.zoom, destination.zoom, t);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

/** The slab edges, lift shaft and patio supports make the space between rooms a building. */
export function createFloorSection(scene: THREE.Scene) {
  const root = new THREE.Group(); root.name = 'factory-floor-section'; root.visible = false; scene.add(root);
  const wall = standard('#1b2336', 1, '#060b16');
  const edge = standard('#485065', 1, '#121629');
  const shaft = standard('#222f3e', .85, '#080f18');
  const strip = standard('#72a99c', .8, '#234c47');
  strip.emissiveIntensity = .65;
  const make = (name: string, size: [number,number,number], at: [number,number,number], material: THREE.Material) => {
    const mesh = propPart(root, size, at, material); mesh.name = name; mesh.castShadow = false; return mesh;
  };
  make('foundation-wall', [24.1, 8.35, .25], [GARAGE_SECTION_X, -4.2, -4.82], wall);
  make('upper-slab-edge', [16.4, .22, .2], [0, -.11, 13.92], edge);
  make('upper-slab-side', [.18, .22, 18.5], [8.05, -.11, 4.65], edge);
  make('lift-shaft', [1.65, 8.4, .5], [FACTORY_ELEVATOR.x, -4.2, -4.65], shaft);
  for (const side of [-1, 1]) {
    make('shaft-guide', [.045, 8.4, .035], [FACTORY_ELEVATOR.x + side * .6, -4.2, -4.37], edge);
    make('shaft-light', [.018, 8.4, .02], [FACTORY_ELEVATOR.x + side * .51, -4.2, -4.34], strip);
  }
  for (const x of [8.25, 15.75, 23.75]) {
    make('patio-support', [.28, 1.4, .38], [x, -.7, 8.2], shaft);
  }
  make('patio-slab-edge', [16, .22, .32], [16, -.11, 8.2], edge);
  return { root, dispose() {
    root.removeFromParent(); root.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    wall.dispose(); edge.dispose(); shaft.dispose(); strip.dispose();
  } };
}
