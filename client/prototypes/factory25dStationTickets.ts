import * as THREE from 'three';
import type { WorldSnapshot, StationTicketPayout } from '@shared/types';
import { WORKSTATIONS, GARAGE_LEVEL, MINI_WORKSTATION_ID, factoryScenePoint, type FactoryRoom, type Workstation } from '@shared/factory25d-layout';
import { patioFloorHeight } from '@shared/factory25d-patio';
import { ticketPayoutProgress } from '@shared/station-tickets';
import './factory25dStationTickets.css';

/** The outlet belongs to the actual prop surface, not the agent's standing slot. */
export function stationTicketMount(station: Workstation) {
  const local = factoryScenePoint(station);
  const floor = station.room === 'garage' ? GARAGE_LEVEL : station.room === 'patio' ? patioFloorHeight(station) : 0;
  const at = (x: number, y: number, z: number, hardware = true) => ({
    outlet: new THREE.Vector3(local.x + x, floor + y, local.z + z), hardware,
    hand: new THREE.Vector3(local.x, floor + .38, local.z + .53),
  });
  // Jonathan folds the entire laptop stand away. Only his little paper slip
  // appears while collecting; there must never be a printer floating by the Mini.
  if (station.id === MINI_WORKSTATION_ID) return at(.10, .38, .49, false);
  if (station.room === 'patio') {
    // The .41-high tabletops have .075 thickness. Sit the case on top and
    // feed beyond the front edge, clear of the mug behind its right shoulder.
    return at(.42, .41 + .075 / 2 + .055 / 2, .328);
  }
  if (station.room === 'garage') {
    if (station.id === 'garage-0' || station.id === 'garage-1') {
      // These arcade bodies are .35 behind their shared station anchor.
      return at(-.19, .31, -.35 + .17 + .007);
    }
    // Window desk center is .4 behind the work anchor, with a .76-deep,
    // .09-thick top centered at .67. Keep the entire case over that top.
    return at(.42, .67 + .09 / 2 + .055 / 2, -.4 + .76 / 2 + .003);
  }
  const scale = .66, indoor = Number(station.id.replace('inside-', ''));
  const candidate = indoor < 6 ? indoor + 5 : indoor - 7;
  // The back-row models already have a modeled ticket outlet. Reuse those
  // openings instead of attaching a second device in front of an empty cavity.
  const builtIn: Record<number, [number, number, number]> = {
    5: [0, .265, .326], 6: [0, .265, .297], 7: [.20, .29, .244],
    8: [0, .265, .151], 10: [.23, .49, .257],
  };
  if (builtIn[candidate]) {
    const [x, y, z] = builtIn[candidate]; return at(x * scale, y * scale, (z + .025) * scale, false);
  }
  // Rally's center is occupied by the specimen badge. Mount beside it on the
  // lower hood rather than letting the emerging paper pass through the badge.
  if (candidate === 9) return at(.20 * scale, .46 * scale, .18 * scale + .008);
  // Front-face heights avoid vents, speakers and the specimen badge. The
  // Vector's pedestal tapers; its mount uses the face depth at this height.
  const front: Record<number, [number, number, number]> = {
    0: [.22, .30, .215], 1: [0, .30, .254], 2: [0, .27, .16],
    3: [.22, .49, .185], 4: [0, .29, .165],
  };
  const [x, y, z] = front[candidate] ?? [.24, .30, .26];
  return at(x * scale, y * scale, z * scale + .008);
}

/** A shared payout clock drives a physical strip and collection in every room. */
export function createStationTickets(scenes: Record<FactoryRoom, THREE.Scene>, canvas: HTMLCanvasElement) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#333b45', roughness: .65 });
  const slotMaterial = new THREE.MeshBasicMaterial({ color: '#0e1520' });
  const ticketMaterials = { factory: '#f0bb79', patio: '#e5e2ca', garage: '#b5d3ce' };
  const papers = Object.fromEntries(Object.entries(ticketMaterials).map(([room, color]) => [room, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })])) as Record<FactoryRoom, THREE.MeshStandardMaterial>;
  const inkMaterial = new THREE.MeshStandardMaterial({ color: '#a86854', roughness: 1 });
  const caseGeometry = new THREE.BoxGeometry(.17, .055, .10), slotGeometry = new THREE.BoxGeometry(.14, .016, .005);
  const paperGeometry = new THREE.BoxGeometry(.13, .038, .004), inkGeometry = new THREE.BoxGeometry(.095, .002, .002);
  const fixed: THREE.InstancedMesh[] = [], disposable: THREE.BufferGeometry[] = [caseGeometry, slotGeometry, paperGeometry, inkGeometry];
  const mounts = WORKSTATIONS.map(stationTicketMount);
  for (const room of ['factory', 'patio', 'garage'] as const) {
    const indices = WORKSTATIONS.flatMap((s, i) => s.room === room && mounts[i].hardware ? [i] : []);
    const bodies = new THREE.InstancedMesh(caseGeometry, bodyMaterial, indices.length), slots = new THREE.InstancedMesh(slotGeometry, slotMaterial, indices.length);
    bodies.name = `${room}-ticket-printers`; slots.name = `${room}-ticket-slots`;
    const matrix = new THREE.Matrix4();
    indices.forEach((index, i) => {
      const at = mounts[index].outlet; bodies.setMatrixAt(i, matrix.makeTranslation(at.x, at.y, at.z - .052));
      slots.setMatrixAt(i, matrix.makeTranslation(at.x, at.y, at.z));
    });
    scenes[room].add(bodies, slots); fixed.push(bodies, slots);
  }
  const active = new Map<string, { group: THREE.Group; pieces: THREE.Group[]; label: HTMLSpanElement; payout: StationTicketPayout }>();
  const point = new THREE.Vector3();
  function remove(id: string) { const item = active.get(id); if (!item) return; item.group.removeFromParent(); item.label.remove(); active.delete(id); }
  return {
    update(snapshot: WorldSnapshot | undefined, now: number, camera: THREE.Camera, visible: (room: FactoryRoom) => boolean, reduced: boolean) {
      const ids = new Set<string>();
      for (const agent of snapshot?.agents ?? []) {
        const payout = agent.ticketPayout, progress = ticketPayoutProgress(payout, now);
        if (!payout || progress === undefined) continue;
        const station = WORKSTATIONS[payout.slotIndex]; if (!station) continue;
        // Manual movement can interrupt collection; earned tickets are already safe in the wallet.
        if (agent.manualControl || agent.world.slotIndex !== payout.slotIndex) continue;
        ids.add(payout.id);
        let entry = active.get(payout.id);
        if (!entry) {
          const group = new THREE.Group(); group.name = 'station-ticket-strip';
          const label = document.createElement('span'); label.className = 'ticket-collection-note';
          label.textContent = `+${payout.count} ${payout.count === 1 ? 'ticket' : 'tickets'}`;
          label.setAttribute('aria-label', `${agent.username} collected ${payout.count} tickets`);
          canvas.parentElement!.append(label);
          const pieces = Array.from({ length: 6 }, () => {
            const piece = new THREE.Group(), paper = new THREE.Mesh(paperGeometry, papers[station.room]); piece.add(paper);
            for (const y of [-.014, .014]) { const line = new THREE.Mesh(inkGeometry, inkMaterial); line.position.set(0, y, .003); piece.add(line); }
            group.add(piece); return piece;
          });
          scenes[station.room].add(group); entry = { group, pieces, label, payout }; active.set(payout.id, entry);
        }
        const mount = mounts[payout.slotIndex], collecting = Math.max(0, (progress - .64) / .36);
        // A short accordion strip feeds out, then folds into the waiting agent's hand.
        const feed = reduced ? 1 : Math.min(1, progress / .58);
        const reach = reduced ? 0 : collecting * collecting * (3 - 2 * collecting);
        entry.group.position.lerpVectors(mount.outlet, mount.hand, reach);
        entry.group.scale.setScalar(1 - reach * .85);
        const spacing = Math.max(.008, Math.min(.035, (mount.outlet.y - (mount.hand.y - .38) - .045) / 5));
        entry.pieces.forEach((piece, i) => {
          piece.visible = feed * 6 >= i + .2;
          piece.scale.set(mount.hardware ? 1 : .88, spacing / .035, 1);
          piece.position.set(0, -.018 - i * spacing, station.room === 'factory' ? (i % 2) * .009 : 0);
          piece.rotation.x = station.room === 'factory' ? i % 2 ? -.25 : .25 : 0;
        });
        entry.group.visible = visible(station.room) && !document.hidden;
        entry.label.hidden = !entry.group.visible;
        if (!entry.label.hidden) {
          entry.group.getWorldPosition(point); point.y += .32; point.project(camera);
          entry.label.hidden = Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1;
          entry.label.style.left = `${(point.x + 1) * canvas.clientWidth / 2}px`;
          entry.label.style.top = `${(1 - point.y) * canvas.clientHeight / 2}px`;
        }
      }
      for (const id of active.keys()) if (!ids.has(id)) remove(id);
      canvas.dataset.ticketPayouts = String(active.size);
    },
    dispose() {
      for (const id of active.keys()) remove(id);
      fixed.forEach(mesh => { mesh.removeFromParent(); mesh.dispose(); });
      disposable.forEach(geometry => geometry.dispose());
      [bodyMaterial, slotMaterial, ...Object.values(papers), inkMaterial].forEach(material => material.dispose());
      delete canvas.dataset.ticketPayouts;
    },
  };
}
