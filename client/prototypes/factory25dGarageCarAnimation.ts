import * as THREE from 'three';
import { GARAGE_CAR_IDS, GARAGE_CAR_VISIT_MS, garageCarVisitPose, type GarageCarId } from '@shared/factory25d-garage';
import { GARAGE_LEVEL, GARAGE_WORLD_Z, fromFactoryWorld } from '@shared/factory25d-layout';
import type { createLiveAgents } from './factory25dLiveAgents';

type Rig = { root: THREE.Group; door?: THREE.Object3D; doorRotation?: THREE.Euler; entry: THREE.Object3D; seat: THREE.Object3D };
/** Animate the existing avatar and authored GLB hinges; no substitute driver character. */
export function createGarageCarAnimation(cars: Map<string, THREE.Group>) {
  const rigs = new Map<GarageCarId, Rig>(), point = new THREE.Vector3(), seatPoint = new THREE.Vector3();
  let agents: ReturnType<typeof createLiveAgents> | undefined;
  let engine: { car: GarageCarId; throttle: number } | undefined;
  const visits = new Map<GarageCarId,string>();
  function rigFor(id: GarageCarId) {
    if (rigs.has(id)) return rigs.get(id);
    const root = cars.get(id); if (!root) return;
    let door: THREE.Object3D | undefined, entry: THREE.Object3D | undefined, seat: THREE.Object3D | undefined;
    root.traverse(node => {
      if (node.userData.role === 'driver_socket') seat = node;
      if (node.userData.role === 'entry_socket') entry = node;
      if (node.userData.role === 'door' && node.name.startsWith('door_left')) door = node;
      if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material.name === 'Glass · quiet blue') { material.transparent = true; material.opacity = .48; material.depthWrite = false; }
      }
    });
    if (!entry || !seat) return;
    const rig = { root, door, entry, seat, doorRotation: door?.rotation.clone() };
    rigs.set(id, rig); return rig;
  }
  return {
    visits,
    configure(next: ReturnType<typeof createLiveAgents>) { agents = next; },
    engine: () => engine,
    update(visible: boolean, reduced: boolean) {
      engine = undefined;
      visits.clear();
      for (const id of GARAGE_CAR_IDS) {
        const rig = rigFor(id); if (!rig) continue;
        rig.root.rotation.z = 0; rig.root.position.y = .025;
        if (rig.door && rig.doorRotation) rig.door.rotation.copy(rig.doorRotation);
      }
      if (!agents) return;
      const now = agents.serverNow();
      for (const entry of agents.entries.values()) {
        const visit = entry.session.world.carVisit;
        if (!visit || entry.session.manualControl || entry.session.activity !== 'idle') continue;
        const elapsed = now - visit.startedAt, rig = rigFor(visit.car);
        if(elapsed < GARAGE_CAR_VISIT_MS) visits.set(visit.car,elapsed < 0 ? 'walking over' : garageCarVisitPose(elapsed).phase);
        if (!rig || elapsed < 0 || elapsed >= GARAGE_CAR_VISIT_MS) continue;
        const pose = garageCarVisitPose(elapsed);
        const source = fromFactoryWorld(entry.session.world.movement?.to ?? entry.session.world.position);
        const start = new THREE.Vector3(source.x, GARAGE_LEVEL + .025, source.z - GARAGE_WORLD_Z);
        // Walk around the rear quarter to the authored left entry, clear of the body.
        const corner = rig.root.localToWorld(new THREE.Vector3(-1.6, 0, -2.2));
        rig.entry.getWorldPosition(point);
        const clearance = visit.car === 'delorean' ? .15 : visit.car === 'f1' ? .35 : .3;
        const doorPoint = point.clone().add(new THREE.Vector3(-clearance,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),rig.root.rotation.y));
        const total = start.distanceTo(corner) + corner.distanceTo(doorPoint), distance = pose.approach * total;
        const first = start.distanceTo(corner);
        point.copy(distance < first ? start.clone().lerp(corner, distance / Math.max(.001, first)) : corner.clone().lerp(doorPoint, (distance-first)/Math.max(.001,total-first)));
        rig.seat.getWorldPosition(seatPoint);
        point.lerp(seatPoint, pose.seat);
        if (visit.car === 'f1' && !reduced) point.y += Math.sin(pose.seat * Math.PI) * .3;
        agents.poseGaragePassenger(entry.session.sessionId, { x: point.x, z: point.z + GARAGE_WORLD_Z }, Math.max(0,point.y-GARAGE_LEVEL-.018), pose.seat, pose.walking, elapsed/1000, pose.phase);
        if (rig.door && rig.doorRotation) {
          const axis = rig.door.userData.openAxis === 'z' ? 'z' : 'y';
          // The two conventional-door models exported inward yaw signs; gullwings are correct.
          rig.door.rotation[axis] = rig.doorRotation[axis] + Number(rig.door.userData.openAngle) * (axis === 'y' ? -1 : 1) * pose.door;
        }
        if (pose.engine) {
          if (visible && (!engine || pose.throttle > engine.throttle)) engine = { car: visit.car, throttle: pose.throttle };
          if (!reduced) { rig.root.rotation.z = Math.sin(elapsed*.06)*(.001+pose.throttle*.004); rig.root.position.y += Math.sin(elapsed*.045)*pose.throttle*.004; }
        }
      }
    },
  };
}
