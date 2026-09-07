import * as THREE from 'three';
import { GARAGE_LEVEL, GARAGE_WORLD_Z, MINI_WORKSTATION_ID, MINI_WORKSTATION_SLOT, MINI_WORKSTATION_USERNAME, WORKSTATIONS, fromFactoryWorld } from '@shared/factory25d-layout';
import { slotPosition } from '@shared/world-layouts';
import { agentPosition } from './factory25dWorld';
import { isWorking } from './factory25dWorkstations';
import { propPart, standard } from './factory25dProps';
import type { createLiveAgents } from './factory25dLiveAgents';

const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const SETUP_MS = 5200, PACK_MS = 4500;
/** Folded props travel from the Mini's actual passenger compartment into a usable workstation. */
export function miniWorkPose(time: number, packing = false) {
  if (packing) return {
    approach: smooth((time - 700) / 1300) * (1 - smooth((time - 3100) / 900)),
    take: 1 - smooth((time - 2000) / 600),
    tabletop: 1 - smooth(time / 700),
    lid: 1 - smooth(time / 550),
    door: smooth((time - 1300) / 650) * (1 - smooth((time - 2600) / 500)),
    blendOut: smooth((time - 4000) / 500),
    walking: time >= 700 && time < 2000 || time >= 3100 && time < 4000,
    working: false, phase: 'packing the laptop away',
  };
  return {
    approach: smooth(time / 1600) * (1 - smooth((time - 2900) / 1400)),
    take: smooth((time - 2300) / 600),
    tabletop: smooth((time - 4300) / 900),
    lid: smooth((time - 4650) / 550),
    door: smooth((time - 1250) / 700) * (1 - smooth((time - 2850) / 600)),
    blendOut: 0,
    walking: time < 1600 || time >= 2900 && time < 4300,
    working: time >= SETUP_MS,
    phase: time < 1600 ? 'walking to the Mini' : time < 2900 ? 'getting the laptop' : time < 4300 ? 'carrying the laptop' : time < SETUP_MS ? 'opening the laptop' : 'working beside the Mini',
  };
}

export function createMiniWorkstation(room: THREE.Group, cars: Map<string, THREE.Group>) {
  const props = new THREE.Group(); props.name = 'mini-laptop-workstation'; room.add(props); props.visible = false;
  const alloy = standard('#8899a4'), dark = standard('#172235'), keys = standard('#bac5c7');
  const screen = standard('#274f4a', .9, '#377e6b'); screen.emissiveIntensity = .55;
  const laptop = new THREE.Group(); laptop.name = 'jonathan-laptop'; props.add(laptop);
  laptop.scale.setScalar(.85);
  propPart(laptop, [.43, .025, .29], [0, 0, 0], alloy);
  for (let row = 0; row < 3; row++) propPart(laptop, [.33, .006, .013], [0, .016, -.065 + row * .034], dark);
  propPart(laptop, [.1, .004, .05], [0, .016, .088], dark);
  const lid = new THREE.Group(); lid.position.set(0, .02, -.135); laptop.add(lid);
  propPart(lid, [.43, .022, .28], [0, 0, .14], dark);
  propPart(lid, [.38, .008, .235], [0, -.015, .14], screen);
  for (let line = 0; line < 4; line++) propPart(lid, [.12 + line % 2 * .12, .005, .014], [-.035, -.021, .06 + line * .045], keys);
  // Human-sized deck (.34 high), folded up and stowed whenever the Mini is unused.
  const stand = new THREE.Group(); stand.name = 'folding-laptop-stand'; props.add(stand);
  propPart(stand, [.56, .035, .4], [0, .32, 0], standard('#98794f'));
  for (const side of [-1, 1]) for (const tilt of [-1, 1]) {
    const leg = propPart(stand, [.025, .34, .025], [side * .225, .16, 0], alloy); leg.rotation.x = tilt * .65;
  }
  let agents: ReturnType<typeof createLiveAgents> | undefined;
  let phase: string | undefined;
  let active: { id: string; startedAt: number; packAt?: number } | undefined;
  let rig: { root: THREE.Group; door: THREE.Object3D; seat: THREE.Object3D; entry: THREE.Object3D; closed: number } | undefined;
  function findRig() {
    if (rig) return rig;
    const root = cars.get('mini'); if (!root) return;
    let door: THREE.Object3D | undefined, seat: THREE.Object3D | undefined, entry: THREE.Object3D | undefined;
    root.traverse(node => {
      if (node.userData.role === 'door' && node.name.startsWith('door_left')) door = node;
      if (node.userData.role === 'driver_socket') seat = node;
      if (node.userData.role === 'entry_socket') entry = node;
    });
    if (door && seat && entry) rig = { root, door, seat, entry, closed: door.rotation.y };
    return rig;
  }
  return {
    props, laptop, stand,
    phase: () => phase,
    configure(next: ReturnType<typeof createLiveAgents>) { agents = next; },
    update(reduced: boolean, enabled = true) {
      props.visible = false; phase = undefined;
      const model = findRig(); if (!agents || !model) return;
      const now = agents.serverNow();
      const worker = [...agents.entries.values()].find(({ session }) => session.username === MINI_WORKSTATION_USERNAME
        && session.world.miniWork && !session.manualControl && session.activity !== 'stopped'
        && (session.world.miniWork.packingAt !== undefined || session.world.zone === 'work' && isWorking(session.activity)
          && WORKSTATIONS[session.world.slotIndex ?? -1]?.id === MINI_WORKSTATION_ID));
      if (worker && (!active || active.id !== worker.session.sessionId || active.startedAt !== worker.session.world.miniWork!.startedAt)) {
        active = { id: worker.session.sessionId, startedAt: worker.session.world.miniWork!.startedAt, packAt: worker.session.world.miniWork!.packingAt };
      }
      if (!worker) { active = undefined; return; }
      if (!active) return;
      const entry = agents.entries.get(active.id);
      if (!entry || entry.session.manualControl || entry.session.activity === 'stopped' || agents.isPerforming(active.id) || !enabled) {
        active = undefined; return;
      }
      if (worker?.session.world.miniWork?.packingAt !== undefined) active.packAt = worker.session.world.miniWork.packingAt;
      const packing = active.packAt !== undefined;
      const time = now - (active.packAt ?? active.startedAt);
      if (time < 0) return;
      if (packing && time >= PACK_MS) { active = undefined; return; }
      const pose = miniWorkPose(reduced ? packing ? PACK_MS : Math.max(time, SETUP_MS) : time, packing);
      phase = pose.phase;
      const workPoint = fromFactoryWorld(slotPosition('factory25d', 'work', MINI_WORKSTATION_SLOT));
      const home = new THREE.Vector3(workPoint.x, GARAGE_LEVEL + .025, workPoint.z - GARAGE_WORLD_Z);
      const door = model.entry.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-.3, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), model.root.rotation.y));
      const corner = new THREE.Vector3(Math.max(home.x, door.x), home.y, Math.max(1.6, door.z));
      const first = home.distanceTo(corner), total = first + corner.distanceTo(door), distance = pose.approach * total;
      const point = distance < first ? home.clone().lerp(corner, distance / Math.max(first, .001)) : corner.clone().lerp(door, (distance - first) / Math.max(total - first, .001));
      if (pose.blendOut) {
        const live = agentPosition(entry.session, now, 'factory25d');
        point.lerp(new THREE.Vector3(live.x, GARAGE_LEVEL + .025, live.z - GARAGE_WORLD_Z), pose.blendOut);
      }
      agents.poseGarageWorker(active.id, { x: point.x, z: point.z + GARAGE_WORLD_Z }, pose.walking, pose.working, time / 1000, pose.phase);
      model.door.rotation.y = model.closed + .95 * pose.door;
      props.visible = pose.take > 0 || pose.tabletop > 0;
      const carried = point.clone().add(new THREE.Vector3(0, .35, .14));
      const stored = model.seat.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .025, 0));
      const deck = new THREE.Vector3(home.x + .36, GARAGE_LEVEL + .355, home.z + .24);
      laptop.position.copy(stored.lerp(carried, pose.take).lerp(deck, pose.tabletop));
      laptop.position.y -= GARAGE_LEVEL;
      laptop.visible = pose.take > 0;
      laptop.rotation.set(0, -.35 * pose.tabletop, reduced ? 0 : Math.sin(time * .014) * .018 * Number(pose.walking));
      lid.rotation.x = -1.8 * pose.lid;
      stand.visible = pose.tabletop > 0;
      stand.position.set(home.x + .36, 0, home.z + .24); stand.rotation.y = -.35; stand.scale.y = Math.max(.025, pose.tabletop);
      screen.emissiveIntensity = pose.working ? .55 + (reduced ? 0 : Math.sin(now * .002) * .06) : .2;
    },
    dispose() {
      props.removeFromParent();
      const materials = new Set<THREE.Material>();
      props.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material)); } });
      materials.forEach(material => material.dispose());
    },
  };
}
