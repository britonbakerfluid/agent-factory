import * as THREE from 'three';
import { clearFactorySegment, factoryRoomAt, factoryScenePoint, fromFactoryWorld, recoverFactoryPosition,
  routeToStation, toFactoryWorld, type FactoryRoom, type RoomPoint } from '@shared/factory25d-layout';
import { BEANBAG_REST } from '@shared/factory25d-rest';

const distance = (a: RoomPoint, b: RoomPoint) => Math.hypot(a.x - b.x, a.z - b.z);
export function avatarWalkablePoint(point: RoomPoint, seated: boolean): RoomPoint {
  return seated ? { ...BEANBAG_REST.approach } : fromFactoryWorld(recoverFactoryPosition(toFactoryWorld(point)));
}

/** A close-up looks almost horizontally across the room. Test the whole silhouette,
 * not just the floor footprint, so tables and beanbags cannot cover the draft. */
export function avatarClearanceRoute(scene: THREE.Scene, room: FactoryRoom, origin: RoomPoint, seated: boolean,
  floorAt: (point: RoomPoint) => number): RoomPoint[] {
  scene.updateMatrixWorld(true);
  const obstacles: Array<{ mesh: THREE.Mesh; bounds: THREE.Box3 }> = [];
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.sessionId) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(material => material.visible && material.depthWrite && material.opacity > .2)) return;
    // Other people and their transparent sprite margins aren't room furniture.
    if (object.geometry.type === 'PlaneGeometry' && materials.some(material => material.alphaTest > 0)) return;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) obstacles.push({ mesh: object,
      bounds: object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld) });
  });
  const raycaster = new THREE.Raycaster(), towardCamera = new THREE.Vector3(0, .48, 3).normalize();
  const point = new THREE.Vector3(), cameraPoint = new THREE.Vector3();
  const hits: THREE.Intersection[] = [];
  function visible(at: RoomPoint) {
    const local = factoryScenePoint(at), floor = floorAt(at);
    for (const x of [-.34, 0, .34]) for (const y of [.09, .35, .65, .82]) {
      point.set(local.x + x, floor + y, local.z); scene.localToWorld(point);
      cameraPoint.copy(point).addScaledVector(towardCamera, 3.15);
      raycaster.set(cameraPoint, towardCamera.clone().negate()); raycaster.far = 3.12;
      for (const { mesh, bounds } of obstacles) {
        if (!raycaster.ray.intersectsBox(bounds)) continue;
        hits.length = 0; mesh.raycast(raycaster, hits);
        if (hits.some(hit => hit.distance < raycaster.far)) return false;
      }
    }
    return true;
  }
  const start = avatarWalkablePoint(origin, seated);
  const prefix = distance(start, origin) > .01 ? [start] : [];
  if (!seated && !prefix.length && visible(origin)) return [];
  const candidates = seated ? [] : [start];
  // Prefer a short step sideways or forward, staying in the same room.
  for (const radius of seated ? [1.2, 1.9, 2.8, 4] : [.7, 1.2, 1.9, 2.8, 4]) for (const angle of [Math.PI / 4, Math.PI / 2, 0,
    -Math.PI / 4, Math.PI, 3 * Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4]) {
    candidates.push({ x: start.x + Math.cos(angle) * radius, z: start.z + Math.sin(angle) * radius });
  }
  for (const candidate of candidates) {
    if (factoryRoomAt(candidate) !== room || !clearFactorySegment(candidate, candidate) || !visible(candidate)) continue;
    const route = routeToStation(start, candidate);
    if (distance(route.at(-1)!, candidate) > .01) continue;
    // Don't take a long detour through another room to reach a nearby point.
    let previous = start, length = 0;
    for (const next of route) { length += distance(previous, next); previous = next; }
    if (length > 6 || route.some(next => factoryRoomAt(next) !== room)) continue;
    return [...prefix, ...route].filter((next, i, all) => distance(i ? all[i - 1] : origin, next) > .01);
  }
  return prefix;
}
