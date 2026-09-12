import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import type { PickupPose, PickupStage, PickupTarget, PickupVector } from '@shared/pickup-motion';
import type { SharedPickupView } from './factory25dSharedPickup';
import { avatarTexture } from './factory25dAvatarTexture';
import { createPickupFold } from './factory25dPickupFold';

/** Observers interpolate actual rendered poses; their camera never invents a lift height. */
export function createSharedPickupVisual(mesh: THREE.Mesh, avatar: AvatarConfig, target: PickupTarget, channel: SharedPickupView) {
  const material = mesh.material as THREE.MeshStandardMaterial;
  const original = material.map!, normal = original.clone(), maps = { normal } as Record<PickupPose['atlas'], THREE.Texture>;
  const baseScale = mesh.scale.clone(), depthTest = material.depthTest, depthWrite = material.depthWrite,
    transparent = material.transparent, order = mesh.renderOrder;
  const home = mesh.position.clone(), pin = new THREE.Vector3();
  let fold: ReturnType<typeof createPickupFold> | undefined, remote = false;
  const vector = (v: THREE.Vector3) => v.toArray().map(n => Math.round(n * 10000) / 10000) as PickupVector;
  function reset() {
    if (!remote) return;
    remote = false; fold?.set(false); material.map = original; material.depthTest = depthTest; material.depthWrite = depthWrite;
    material.transparent = transparent; mesh.renderOrder = order; mesh.rotation.z = 0; mesh.scale.copy(baseScale);
    delete mesh.userData.pickupRemote; delete mesh.userData.pickupActive; delete mesh.userData.pickupLanding;
  }
  return {
    mesh,
    rememberHome() { home.copy(mesh.position); },
    begin() { return channel.begin(target); },
    owns: () => channel.owns(target),
    get remote() { return remote; },
    applyRemote() {
      const p = channel.sample(target); if (!p) { reset(); return false; }
      remote = true;
      mesh.position.fromArray(p.position); mesh.scale.fromArray(p.scale); mesh.rotation.z = p.rotation;
      const airborne = p.stage === 'lifted' || p.stage === 'falling' || p.stage === 'dunking';
      mesh.userData.pickupRemote = true; mesh.userData.pickupActive = true;
      mesh.userData.pickupRemoteStage = p.stage; mesh.userData.pickupRemoteAirborne = airborne;
      mesh.userData.pickupHeight = p.height; mesh.userData.pickupLanding = p.landing && { x: p.landing[0], z: p.landing[1] };
      mesh.userData.pickupFalling = p.stage === 'falling' || p.stage === 'dunking';
      if (!maps[p.atlas]) maps[p.atlas] = avatarTexture(avatar, p.atlas === 'landing' ? ['hero_land'] : ['walk_right','walk_left','walk_down','walk_up']).texture;
      material.map = maps[p.atlas]; material.map.offset.set(p.uv[0], p.uv[1]); material.map.repeat.set(p.uv[2], p.uv[3]);
      material.depthTest = p.stage === 'lifted' ? false : depthTest; material.depthWrite = p.stage === 'lifted' ? false : depthWrite;
      material.transparent = !!p.pin || transparent; mesh.renderOrder = p.pin ? 1000 : order;
      fold ??= createPickupFold(mesh, avatar);
      if (p.pin) { mesh.updateWorldMatrix(true, false); pin.fromArray(p.pin); mesh.localToWorld(pin); fold.set(true, 0, p.rotation, pin); }
      else fold.set(false);
      return true;
    },
    publish(stage: PickupStage) {
      const map = material.map!;
      channel.publish(target, { position: vector(mesh.position), home: vector(home), scale: vector(mesh.scale), rotation: mesh.rotation.z,
        pin: mesh.userData.pickupPin ?? null, landing: mesh.userData.pickupLanding ? [mesh.userData.pickupLanding.x, mesh.userData.pickupLanding.z] : null,
        height: mesh.userData.pickupHeight ?? 0, stage, atlas: mesh.userData.pickupAtlas ?? 'normal',
        uv: [map.offset.x, map.offset.y, map.repeat.x, map.repeat.y] });
    },
    finish() { channel.finish(target); },
    dispose() { channel.finish(target); reset(); fold?.dispose(); for (const map of Object.values(maps)) map.dispose(); },
  };
}
