import * as THREE from 'three';
import { FACTORY_ELEVATOR, GARAGE_ELEVATOR, GARAGE_LEVEL } from '@shared/factory25d-layout';
import { PATIO } from '@shared/factory25d-patio';
import { ELEVATOR_WIDTH } from './factory25dElevator';
import { propPart, standard } from './factory25dProps';

// The wider garage uses its own room origin. Align the two lift shafts while
// showing the building together, then rebase the settled garage and camera equally.
export const GARAGE_SECTION_X = FACTORY_ELEVATOR.x - GARAGE_ELEVATOR.x;
// The isolated garage origin is far below the factory for normal rendering.
// In the cutaway it sits one storey below, with space for its 3.55-unit ceiling.
const STOREY_HEIGHT = 4.2;
export const GARAGE_SECTION_Y = -STOREY_HEIGHT - GARAGE_LEVEL;
const destination = new THREE.OrthographicCamera();

/** Slide the upper room and patio out together over the whole ride. */
export function upperFloorLift(progress: number) {
  // elevatorTrip already eases progress at both landings. A second, late ease
  // made the room suddenly accelerate upward halfway through the descent.
  return 20 * THREE.MathUtils.clamp(progress, 0, 1);
}

export function floorTravelCamera(camera: THREE.OrthographicCamera, home: THREE.OrthographicCamera, garage01: number, section: boolean, trackUpperFloor = true) {
  const t = THREE.MathUtils.clamp(garage01, 0, 1), shift = section ? GARAGE_SECTION_X : 0;
  const floorY = GARAGE_LEVEL + (section ? GARAGE_SECTION_Y : 0);
  destination.copy(home);
  destination.position.set(shift, floorY + 18.94, 23.8);
  destination.lookAt(shift, floorY + 1.57, 5.8);
  destination.zoom = .66;
  camera.copy(home);
  camera.position.lerpVectors(home.position, destination.position, t);
  camera.quaternion.slerpQuaternions(home.quaternion, destination.quaternion, t);
  // Each separately rendered floor keeps its settled scale for the whole ride.
  camera.zoom = trackUpperFloor && t < 1 ? home.zoom : destination.zoom;
  if (trackUpperFloor && section && t > 0 && t < 1) {
    // Read the upper slab from below as it arrives, edge-on as we pass its
    // height, then from above. This is tied to the moving floor, not a bob
    // added to the camera independently of the building.
    const homeDirection = home.getWorldDirection(new THREE.Vector3());
    const depth = 18;
    const homeFocus = home.position.clone().addScaledVector(homeDirection, depth);
    const upperHeight = homeFocus.y + upperFloorLift(t);
    const upperPitch = Math.atan2(upperHeight - camera.position.y, -homeDirection.z * depth);
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const settledPitch = Math.asin(direction.y);
    // Once the upper slab is above the frame, hand the framing to the garage.
    const garageWeight = THREE.MathUtils.smoothstep(t, .68, 1);
    const pitch = THREE.MathUtils.lerp(upperPitch, settledPitch, garageWeight);
    const focus = camera.position.clone().addScaledVector(direction, depth);
    camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), pitch - settledPitch,
    ));
    camera.getWorldDirection(direction);
    camera.position.copy(focus).addScaledVector(direction, -depth);
  }
  if (!trackUpperFloor && t < 1) {
    // As we rise away from the garage, see MORE of its floor. Reversing the
    // same path lowers us toward it and gradually reduces that downward angle.
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const focus = camera.position.clone().addScaledVector(direction, 18);
    const settledPitch = Math.asin(direction.y);
    const pitch = -Math.atan2(17.37 + STOREY_HEIGHT * (1 - t), 18);
    camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), pitch - settledPitch,
    ));
    camera.getWorldDirection(direction);
    camera.position.copy(focus).addScaledVector(direction, -18);
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
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
  make('foundation-wall', [24.1, .5, .25], [GARAGE_SECTION_X, -.36, -4.82], wall);
  // The normal room floors are one-sided planes. Give the passing camera real
  // slab undersides, with their tops below the existing receiving surfaces.
  make('upper-slab-underside', [16.4, .2, 18.5], [0, -.12, 4.65], edge);
  make('upper-slab-edge', [16.4, .22, .2], [0, -.11, 13.92], edge);
  make('upper-slab-side', [.18, .22, 18.5], [8.05, -.11, 4.65], edge);
  make('lift-shaft', [ELEVATOR_WIDTH, STOREY_HEIGHT, .5], [FACTORY_ELEVATOR.x, -STOREY_HEIGHT/2, -4.65], shaft);
  for (const side of [-1, 1]) {
    make('shaft-guide', [.045, STOREY_HEIGHT, .035], [FACTORY_ELEVATOR.x + side * ELEVATOR_WIDTH * .36, -STOREY_HEIGHT/2, -4.37], edge);
    make('shaft-light', [.018, STOREY_HEIGHT, .02], [FACTORY_ELEVATOR.x + side * ELEVATOR_WIDTH * .31, -STOREY_HEIGHT/2, -4.34], strip);
  }
  const patioCenter = (PATIO.left + PATIO.right) / 2, patioWidth = PATIO.right - PATIO.left;
  make('patio-upper-underside', [patioWidth, .2, PATIO.edgeZ - PATIO.back],
    [patioCenter, PATIO.upperY - .12, (PATIO.back + PATIO.edgeZ) / 2], edge);
  make('patio-lower-underside', [patioWidth, .2, PATIO.front - PATIO.back],
    [patioCenter, PATIO.lowerY - .12, (PATIO.back + PATIO.front) / 2], edge);
  for (const x of [8.25, 15.75, 23.75]) {
    make('patio-support', [.28, 1.4, .38], [x, PATIO.lowerY - .9, 8.2], shaft);
  }
  make('patio-slab-edge', [patioWidth, .22, .32], [patioCenter, PATIO.lowerY - .11, PATIO.front], edge);
  return { root, dispose() {
    root.removeFromParent(); root.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    wall.dispose(); edge.dispose(); shaft.dispose(); strip.dispose();
  } };
}
