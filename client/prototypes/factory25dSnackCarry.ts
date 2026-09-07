import * as THREE from 'three';
import type { WorldAgent } from '@shared/types';
import { AVATAR_ANIMATIONS } from './factory25dAvatar';
import type { VendingCanBody } from './factory25dVendingPhysics';
import { snackKind, snackTexture, VENDING_SNACKS, disposeSnackTextures } from './factory25dVendingSnacks';

export interface SnackCarrier {
  session: WorldAgent;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  texture: THREE.Texture;
}
interface SnackSource {
  root: THREE.Group;
  readonly dispensedBodies: readonly VendingCanBody[];
  takeDispensed(id: number): VendingCanBody | undefined;
}
type HeldSnack = {
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  since: number;
  from: THREE.Vector3;
};

/** Match the painted hand in the active 32px avatar frame, including its walk stride. */
export function snackHandPose(texture: THREE.Texture, target = new THREE.Vector3()) {
  const row = Math.round((1 - texture.offset.y) * AVATAR_ANIMATIONS.length) - 1;
  const frame = Math.round(texture.offset.x * 4) % 4;
  const side = row === 1 || row === 2, pixel = .86 / 32;
  const walking = row === 3 || row === 4;
  const handY = side ? 23 + (frame % 2 === 0 ? 1 : -2) : 22 + (walking ? (frame % 2 === 0 ? -5 : 3) : 0);
  return target.set((side ? (row === 2 ? -5.5 : 5.5) : 9.5) * pixel,
    (16 - handY) * pixel + .05, row === 4 ? -.012 : .012);
}

/** Browser-local prop ownership. Observes routes; never moves an agent or sends a command. */
export function createSnackCarry(source: SnackSource, canvas: Pick<HTMLCanvasElement, 'dataset'>,
  entries: () => Iterable<SnackCarrier>, canPick: (entry: SnackCarrier) => boolean = () => true) {
  const held = new Map<string, HeldSnack>(), nextPickup = new Map<string, number>();
  const agentWorld = new THREE.Vector3(), itemWorld = new THREE.Vector3(), agentLocal = new THREE.Vector3();
  const target = new THREE.Vector3();
  let pickups = 0;
  const available = (entry: SnackCarrier) => entry.session.activity !== 'stopped'
    && (entry.session.activity === 'idle' || !!entry.session.manualControl) && canPick(entry);
  function release(id: string, time: number) {
    const item = held.get(id); if (!item) return;
    item.sprite.removeFromParent(); item.sprite.geometry.dispose(); item.sprite.material.dispose();
    held.delete(id); nextPickup.set(id, time + 12);
  }
  return {
    update(time: number, allowPickup = true, reducedMotion = false) {
      const seen = new Set<string>();
      for (const entry of entries()) {
        const id = entry.session.sessionId; seen.add(id);
        let item = held.get(id);
        if (item && (!available(entry) || time - item.since >= 21.2)) {
          release(id, time); item = undefined;
        }
        if (!item && allowPickup && entry.mesh.visible && entry.mesh.userData.room === 'factory'
          && available(entry) && time >= (nextPickup.get(id) ?? 0) && source.dispensedBodies.length) {
          entry.mesh.getWorldPosition(agentWorld); agentLocal.copy(agentWorld); source.root.worldToLocal(agentLocal);
          // Only reach from the open front of the cabinet, never through its back or side wall.
          if (agentLocal.z > .39) {
            let nearest: VendingCanBody | undefined, distance = .43 * .43;
            for (const body of source.dispensedBodies) {
              if (body.position.y > .16 || (!body.sleeping && body.velocity.lengthSq() > .0225)) continue;
              itemWorld.copy(body.position); itemWorld.y += .019; source.root.localToWorld(itemWorld);
              const d = (itemWorld.x - agentWorld.x) ** 2 + (itemWorld.z - agentWorld.z) ** 2;
              if (d < distance) { nearest = body; distance = d; }
            }
            if (nearest && source.takeDispensed(nearest.id)) {
              const kind = snackKind(nearest.id), style = VENDING_SNACKS[kind];
              const sprite = new THREE.Mesh(new THREE.PlaneGeometry(style.carryWidth, style.carryHeight),
                new THREE.MeshStandardMaterial({ map: snackTexture(kind), alphaTest: .08, side: THREE.DoubleSide,
                  roughness: 1, emissive: '#101126', emissiveIntensity: .6 }));
              sprite.name = `held-snack-${kind}`; sprite.userData.snackId = nearest.id;
              sprite.castShadow = true;
              itemWorld.copy(nearest.position); itemWorld.y += .019; source.root.localToWorld(itemWorld);
              const from = entry.mesh.worldToLocal(itemWorld.clone());
              entry.mesh.add(sprite); item = { sprite, from, since: time }; held.set(id, item); pickups++;
            }
          }
        }
        if (!item) continue;
        // The same mesh owns its snack through room changes, elevator trips and avatar edits.
        if (item.sprite.parent !== entry.mesh) entry.mesh.add(item.sprite);
        snackHandPose(entry.texture, target);
        const age = time - item.since, lift = reducedMotion ? 1 : Math.min(1, age / .38);
        const ease = lift * lift * (3 - 2 * lift);
        item.sprite.position.lerpVectors(item.from, target, ease);
        if (lift < 1) item.sprite.position.y += Math.sin(lift * Math.PI) * .05;
        // A last sip or bite, then empty hands. Work and other interactions always take priority.
        if (age > 20 && !reducedMotion) {
          const sip = Math.sin(Math.min(1, (age - 20) / 1.2) * Math.PI);
          item.sprite.position.x *= 1 - sip * .75;
          item.sprite.position.y += sip * .23;
        }
      }
      for (const id of held.keys()) if (!seen.has(id)) release(id, time);
      for (const [id, until] of nextPickup) if (!seen.has(id) || time >= until) nextPickup.delete(id);
      canvas.dataset.carriedSnacks = String(held.size); canvas.dataset.snackPickups = String(pickups);
    },
    dispose() {
      for (const id of held.keys()) release(id, 0);
      nextPickup.clear(); disposeSnackTextures();
      delete canvas.dataset.carriedSnacks; delete canvas.dataset.snackPickups;
    },
  };
}
