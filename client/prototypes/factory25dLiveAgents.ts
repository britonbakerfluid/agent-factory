import * as THREE from 'three';
import { patioFloorHeight } from '@shared/factory25d-patio';
import { factoryCompanionPosition } from '@shared/factory25d-layout';
import type { WorldAgent, WorldSnapshot } from '@shared/types';
import { factoryRoomAt, factoryScenePoint, factoryWorldPoint, fromFactoryWorld, GARAGE_LEVEL, GARAGE_WORLD_Z } from '@shared/factory25d-layout';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { avatarTexture, setAvatarTextureFrame } from './factory25dAvatarTexture';
import { avatarEyePose } from './factory25dAvatarEyes';
import { agentPosition, garageElevatorPose } from './factory25dWorld';
import { createNameTag } from './factory25dLabels';
import { watchContributions } from './factory25dContributions';
import { contactShadow } from './factory25dContactShadows';
import { WORKSTATIONS, isWorking } from './factory25dWorkstations';
import { onFactoryMessage } from './factory25dBoardData';
import { createFactoryEffects, type EffectAnchor } from './factory25dEffects';
import { effectPose, effectSeed, FactoryEffectsState, vortexStrength } from './factory25dEffectsState';
import { createFactoryTombstones } from './factory25dTombstones';
import { agentStateStyle, resolveAgentVisualState, stationaryAgentAnimation } from './factory25dAgentStates';
import { ManualMotionBuffer } from './factory25dManualMotion';
import { BEANBAG_REST } from '@shared/factory25d-rest';
import { AvatarWalkCycle, stationaryAvatarFrame } from './factory25dAvatarGait';

type Sprite = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; texture: THREE.CanvasTexture;
  shadow: THREE.Mesh; sheet: ReturnType<typeof avatarSheet>; signature: string; labelFeet: THREE.Vector3; walk: AvatarWalkCycle;
  eyeSeed: number; eyeMode: 'relaxed' | 'thinking' | 'attentive' | 'asleep'; eyesFrozen: boolean };
type Entry = Sprite & { session: WorldAgent; label: ReturnType<typeof createNameTag>; children: Map<string, Sprite>;
  lastX: number; lastZ: number; baseHeight: number; manualMotion: ManualMotionBuffer; garageWalk: AvatarWalkCycle; seatBlend: number; poseTime: number };

export function createLiveAgents(factory: THREE.Scene, patio: THREE.Scene, canvas: HTMLCanvasElement) {
  const entries = new Map<string, Entry>();
  const contributions = watchContributions(() => {
    for (const entry of entries.values()) entry.label.setContribution(contributions.forUser(entry.session.username));
  });
  let garage: { scene: THREE.Scene; isVisible: () => boolean } | undefined;
  const effectState = new FactoryEffectsState(), effects = createFactoryEffects(factory, patio);
  const tombstones = createFactoryTombstones(factory, patio, canvas);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const anchors = new Map<string, EffectAnchor>();
  let snapshot: WorldSnapshot | undefined, clockOffset = 0;
  let eyeTime = 0;
  let view: { camera: THREE.Camera; factory: boolean; patio: boolean; occluder: THREE.Object3D; floor: (point: { x: number; z: number }) => number } | undefined;
  function sprite(agent: WorldAgent, scale = 1, identity = agent.sessionId): Sprite {
    const { sheet, texture } = avatarTexture(agent.avatar ?? DEFAULT_AVATAR, AVATAR_ANIMATIONS, true);
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.08, side: THREE.DoubleSide,
      emissive: '#101126', emissiveIntensity: 0.6, roughness: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86 * scale, 0.86 * scale), material);
    mesh.castShadow = true; mesh.userData.sessionId = agent.sessionId; factory.add(mesh);
    const shadow = contactShadow(factory, { width: 0.22 * scale, depth: 0.12 * scale, spread: 0.065, opacity: 0.3, round: true });
    return { mesh, texture, shadow, sheet, signature: JSON.stringify(agent.avatar), labelFeet: new THREE.Vector3(), walk: new AvatarWalkCycle(),
      eyeSeed: effectSeed(identity), eyeMode: 'relaxed', eyesFrozen: false };
  }
  function removeSprite(item: Sprite) {
    item.mesh.removeFromParent(); item.mesh.geometry.dispose(); item.mesh.material.dispose(); item.texture.dispose();
    item.shadow.removeFromParent(); // Contact shadow geometry/materials are shared by the room.
  }
  function setFrame(item: Sprite, row: number, frame: number, floorY: number, scale = 1) {
    const eyes = avatarEyePose(eyeTime, item.eyeSeed, item.eyeMode,
      motionPreference.matches || item.eyesFrozen);
    setAvatarTextureFrame(item.texture, row, frame, eyes);
    item.mesh.position.y = floorY + (item.sheet.feet[row][frame] / 32 - 0.5) * 0.86 * scale + 0.004;
    item.labelFeet.set(0, (0.5 - item.sheet.feet[row][frame] / 32) * 0.86 * scale, 0);
  }
  function floorAt(point: { x: number; z: number }) {
    const room = factoryRoomAt(point);
    return room === 'garage' ? GARAGE_LEVEL + .018 : room === 'patio' ? patioFloorHeight(point) + .018 : view?.floor({ x: point.x, z: point.z - 1.95 }) ?? .018;
  }
  function visibleAt(point: { x: number; z: number }) {
    const room = factoryRoomAt(point);
    return room === 'garage' ? garage?.isVisible() ?? false : room === 'patio' ? view?.patio ?? false : view?.factory ?? false;
  }
  function place(item: Sprite, x: number, z: number, elevator?: ReturnType<typeof garageElevatorPose>) {
    const room = elevator?.room ?? factoryRoomAt({ x, z }), point = elevator ?? factoryScenePoint({ x, z });
    const parent = room === 'garage' ? garage?.scene ?? factory : room === 'patio' ? patio : factory;
    if (item.mesh.parent !== parent) { parent.add(item.mesh); parent.add(item.shadow); }
    item.mesh.userData.room = room;
    item.mesh.visible = item.shadow.visible = !elevator?.hidden;
    item.mesh.position.x = point.x; item.mesh.position.z = point.z;
    item.shadow.position.set(point.x, (elevator?.floor ?? floorAt({ x, z })) + .003, point.z);
  }
  const stopEffects = onFactoryMessage(message => {
    // World deltas and effects can share a socket batch. Reconcile the latest
    // roster in the next frame before resolving actors and shot targets.
    effectState.enqueue(message, Date.now() + clockOffset);
  });
  return {
    entries,
    contributionFor: contributions.forUser,
    serverNow: () => Date.now() + clockOffset,
    poseGarageWorker(id: string, point: { x: number; z: number }, walking: boolean, working: boolean, elapsed: number, activity: string) {
      eyeTime = elapsed;
      const entry = entries.get(id); if (!entry || !view) return;
      const dx = point.x - entry.mesh.position.x;
      const style = agentStateStyle(resolveAgentVisualState(entry.session));
      const row = walking ? AVATAR_ANIMATIONS.indexOf(dx > 0 ? 'walk_right' : 'walk_left') : working ? AVATAR_ANIMATIONS.indexOf(style.pose) : 0;
      const floorY = GARAGE_LEVEL + .018;
      const walkFrame = entry.garageWalk.sample(point, elapsed, walking, motionPreference.matches);
      place(entry, point.x, point.z); setFrame(entry, row, walking ? walkFrame : stationaryAvatarFrame(AVATAR_ANIMATIONS[row], elapsed, style.fps, motionPreference.matches), floorY);
      entry.mesh.scale.set(1, 1, 1); entry.mesh.rotation.set(0, 0, 0); entry.mesh.material.opacity = 1;
      entry.label.setActivity(working ? `${activity} · ${entry.session.activity}` : activity);
      entry.label.update(entry.mesh, floorY, view.camera, canvas, garage?.isVisible() ?? false, undefined, entry.labelFeet);
    },
    poseGaragePassenger(id: string, point: { x: number; z: number }, height: number, seat: number, walking: boolean, elapsed: number, activity: string) {
      eyeTime = elapsed;
      const entry = entries.get(id); if (!entry || !view) return;
      const local = factoryScenePoint(point), dx = local.x - entry.mesh.position.x;
      const row = seat > .8 ? 6 : walking ? AVATAR_ANIMATIONS.indexOf(dx > 0 ? 'walk_right' : 'walk_left') : 0;
      const floorY = GARAGE_LEVEL + .018;
      const walkFrame = entry.garageWalk.sample(point, elapsed, walking && seat <= .8, motionPreference.matches);
      place(entry, point.x, point.z); setFrame(entry, row, walking ? walkFrame : 0, floorY);
      // Driver sockets anchor the torso; standing positions anchor the feet.
      entry.mesh.position.y += height - (entry.mesh.position.y - floorY) * seat; entry.mesh.scale.set(1,1,1); entry.mesh.rotation.set(0,0,0);
      entry.mesh.material.opacity = 1; entry.shadow.visible = seat < .8;
      entry.label.setActivity(activity);
      entry.label.update(entry.mesh, floorY, view.camera, canvas, garage?.isVisible() ?? false, undefined, entry.labelFeet);
    },
    configureGarage(config: { scene: THREE.Scene; isVisible: () => boolean }) { garage = config; effects.configureGarage(config.scene); tombstones.configureGarage(config); },
    get isVortexActive() { return !!effectState.vortex; },
    isPerforming(id: string) { return effectState.effects.has(id) || !!effectState.vortex; },
    placeOverride(id: string, point: { x: number; z: number }, lift = 0.5) {
      const entry = entries.get(id); if (!entry) return;
      // A grab or a local basketball pose must never inherit a previous emote's
      // squash, rotation or partial disappearance.
      entry.mesh.scale.set(1, 1, 1); entry.mesh.rotation.set(0, 0, 0); entry.mesh.material.opacity = 1;
      const local = factoryScenePoint(point), dx = local.x - entry.mesh.position.x, dz = local.z - entry.mesh.position.z;
      const floorY = floorAt(point);
      place(entry, point.x, point.z); entry.mesh.position.y = floorY + entry.baseHeight + lift;
      for (const child of entry.children.values()) { place(child, child.mesh.position.x + dx, child.mesh.position.z + dz + (factoryRoomAt(point) === 'garage' ? GARAGE_WORLD_Z : 0)); child.mesh.position.y = floorY + lift + .15; }
      effects.follow(id, { x: local.x, y: floorY + lift, z: local.z });
      if (view) entry.label.update(entry.mesh, floorY, view.camera, canvas, visibleAt(point), factoryRoomAt(point) === 'factory' ? view.occluder : undefined, entry.labelFeet);
    },
    sync(next: WorldSnapshot | undefined) {
      if (!next || next === snapshot) return;
      snapshot = next; clockOffset = next.serverTime - Date.now();
      effectState.sync(next);
      const ids = new Set(next.agents.map(agent => agent.sessionId));
      for (const [id, entry] of entries) if (!ids.has(id)) {
        removeSprite(entry); entry.label.dispose(); entry.children.forEach(removeSprite); entries.delete(id);
      }
      for (const agent of next.agents) {
        let entry = entries.get(agent.sessionId);
        if (entry && entry.signature !== JSON.stringify(agent.avatar)) {
          removeSprite(entry); Object.assign(entry, sprite(agent));
        }
        if (!entry) {
          const point = agentPosition(agent, next.serverTime, next.environment);
          const label = createNameTag(agent.sessionName || agent.username, isWorking(agent.activity), canvas.parentElement!);
          label.element.dataset.sessionId = agent.sessionId;
          entry = { ...sprite(agent), session: agent, label, children: new Map(), lastX: point.x, lastZ: point.z, baseHeight: .25,
            manualMotion: new ManualMotionBuffer(), garageWalk: new AvatarWalkCycle(), seatBlend: 0, poseTime: 0 };
          place(entry, point.x, point.z); entries.set(agent.sessionId, entry);
        }
        entry.session = agent;
        entry.manualMotion.push(next.environment === 'factory25d' ? agent.manualControl : undefined, next.serverTime, performance.now());
        const childIds = new Set(agent.subagents.map(child => child.agentId));
        for (const [id, child] of entry.children) if (child.signature !== JSON.stringify(agent.avatar)) { removeSprite(child); entry.children.delete(id); }
        for (const [id, child] of entry.children) if (!childIds.has(id)) { removeSprite(child); entry.children.delete(id); }
        for (const child of agent.subagents) if (!entry.children.has(child.agentId)) entry.children.set(child.agentId, sprite(agent, 0.58, child.agentId));
        entry.label.setDetails(agent.sessionName || agent.username,
          [agent.activity, agent.currentTool].filter(Boolean).join(' · '),
          [agent.taskDescription, agent.cwd.split('/').filter(Boolean).at(-1), `${agent.toolUseCount ?? 0} tool calls`].filter(Boolean).join(' · '));
        entry.label.setContribution(contributions.forUser(agent.username));
      }
      canvas.dataset.liveAgents = String(entries.size);
      canvas.dataset.liveSubagents = String([...entries.values()].reduce((n, e) => n + e.children.size, 0));
    },
    occupied() {
      return new Set([...entries.values()].flatMap(({ session }) => session.world.zone === 'work' && !session.manualControl
        ? [WORKSTATIONS[session.world.slotIndex ?? -1]?.id].filter((id): id is string => !!id) : []).concat(
          [...effectState.tombstones.values()].flatMap(stone => [WORKSTATIONS[stone.slotIndex ?? -1]?.id].filter((id): id is string => !!id))));
    },
    update(elapsed: number, camera: THREE.Camera, showFactory: boolean, showPatio: boolean,
      floor: (point: {x: number; z: number}) => number, occluder: THREE.Object3D) {
      view = { camera, factory: showFactory, patio: showPatio, occluder, floor };
      eyeTime = elapsed;
      if (!snapshot) return;
      const now = Date.now() + clockOffset;
      const reduced = motionPreference.matches;
      const frame = reduced ? 0 : Math.floor(elapsed * 6) % 4;
      effectState.flush(now); anchors.clear();
      const vortex = effectState.vortex;
      for (const entry of entries.values()) {
        const agent = entry.session, manualPose = entry.manualMotion.sample(performance.now());
        let point = manualPose ? fromFactoryWorld(manualPose) : agentPosition(agent, now, snapshot.environment);
        const resting = !agent.manualControl && agent.activity === 'idle' && agent.world.zone === 'idle' && !agent.world.idleVisit && !agent.world.carVisit;
        const chair = resting && agent.world.slotIndex === 0 && Math.hypot(point.x - BEANBAG_REST.approach.x, point.z - BEANBAG_REST.approach.z) < .12 && !effectState.effects.has(agent.sessionId) && !vortex;
        const poseDt = entry.poseTime ? Math.min(.1, elapsed - entry.poseTime) : 0; entry.poseTime = elapsed;
        entry.seatBlend = agent.manualControl ? 0 : THREE.MathUtils.damp(entry.seatBlend, Number(chair), 7, poseDt);
        if (entry.seatBlend < .001) entry.seatBlend = 0;
        if (entry.seatBlend) point = { x: THREE.MathUtils.lerp(point.x, BEANBAG_REST.seat.x, entry.seatBlend), z: THREE.MathUtils.lerp(point.z, BEANBAG_REST.seat.z, entry.seatBlend) };
        const elevator = garageElevatorPose(agent, now, snapshot.environment);
        const visible = !elevator?.hidden && (elevator ? (elevator.room === 'garage' ? garage?.isVisible() ?? false : showFactory) : visibleAt(point));
        const dx = point.x - entry.lastX, dz = point.z - entry.lastZ;
        const moving = elevator ? elevator.walking : manualPose ? manualPose.moving : Math.hypot(dx, dz) > 0.001 || !!agent.manualControl?.moving;
        const effect = effectState.effects.get(agent.sessionId);
        const facing = effect?.kind === 'shot' || effect?.kind === 'gun' ? effect.facing : manualPose?.facing ?? agent.manualControl?.facing ?? (moving
          ? (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up')) : agent.world.facing);
        const working = !agent.manualControl && agent.world.zone === 'work' && isWorking(agent.activity) && !moving;
        const lookingAtMini = agent.world.idleVisit === 'garage-mini' && !moving && !agent.manualControl;
        const visualState = resolveAgentVisualState(agent), style = agentStateStyle(visualState);
        entry.eyeMode = effect?.kind === 'sleep' ? 'asleep' : ['input', 'permission', 'ready', 'error'].includes(visualState) ? 'attentive'
          : ['thinking', 'planning'].includes(visualState) ? 'thinking' : 'relaxed';
        entry.eyesFrozen = visualState === 'stopped' || style.fps <= 0 || effect?.kind === 'sleep';
        // Walking, user control and physical interactions outrank a desk pose.
        const stationaryRow = agent.manualControl ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : isWorking(agent.activity) && !working ? 0 : AVATAR_ANIMATIONS.indexOf(stationaryAgentAnimation(visualState, resting));
        let row = entry.seatBlend > .6 ? AVATAR_ANIMATIONS.indexOf('sit_up') : moving ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : lookingAtMini ? AVATAR_ANIMATIONS.indexOf('walk_up') : stationaryRow;
        if (elevator) row = AVATAR_ANIMATIONS.indexOf(`walk_${elevator.facing}`);
        if (effect && now >= effect.startedAt) row = ['dance', 'merge', 'dizzy', 'shot', 'gun'].includes(effect.kind)
          ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : effect.kind === 'sleep' ? 6 : 0;
        place(entry, point.x, point.z, elevator); entry.lastX = point.x; entry.lastZ = point.z;
        const floorY = elevator?.floor ?? floorAt(point);
        const stateFrame = stationaryAvatarFrame(AVATAR_ANIMATIONS[row], elapsed + effectSeed(agent.sessionId) % 79 / 7, style.fps, reduced);
        const walkFrame = entry.walk.sample(elevator ?? point, elapsed, moving && !effect && !vortex, reduced);
        setFrame(entry, row, lookingAtMini || agent.manualControl && !moving && !effect ? 0 : effect ? frame : moving ? walkFrame : stateFrame, floorY);
        const pose = effectPose(effect, now, reduced);
        const baseHeight = entry.mesh.position.y - floorY;
        entry.baseHeight = baseHeight;
        entry.mesh.scale.set(pose.scaleX, pose.scaleY, 1); entry.mesh.rotation.set(0, 0, pose.angle);
        entry.mesh.position.x += pose.x; entry.mesh.position.y = floorY + baseHeight * pose.scaleY + pose.lift + BEANBAG_REST.height * entry.seatBlend;
        if (entry.seatBlend > .5) entry.shadow.visible = false;
        if (vortex && !reduced && !agent.manualControl && !elevator?.hidden) {
          const strength = vortexStrength(vortex, now), seed = effectSeed(agent.sessionId) + vortex.seed;
          const t = (now - vortex.startedAt) / 1000, angle = seed + t * .75, radius = .7 + (seed % 10) * .12;
          const center = factoryRoomAt(point) === 'garage' ? { x: 0, z: GARAGE_WORLD_Z + 4 } : point.x > 8 ? { x: 15, z: 4 } : { x: 0, z: .8 };
          place(entry, THREE.MathUtils.lerp(point.x, center.x + Math.cos(angle) * radius, strength),
            THREE.MathUtils.lerp(point.z, center.z + Math.sin(angle) * radius * .6, strength));
          entry.mesh.position.y += strength * (.65 + (seed % 7) * .13);
          entry.mesh.rotation.z += Math.sin(angle) * .3 * strength;
          entry.mesh.scale.multiplyScalar(1 - strength * .18);
        }
        entry.label.setActivity(effect ? (effect.kind === 'return' ? 'back again' : effect.kind) : chair ? 'relaxing in the orange chair' : lookingAtMini ? 'looking at the Mini' : [agent.activity, agent.currentTool].filter(Boolean).join(' · '));
        entry.label.element.dataset.performing = effect?.kind ?? (vortex ? 'vortex' : '');
        entry.mesh.material.opacity = pose.opacity * (agent.activity === 'stopped' ? .45 : 1);
        entry.mesh.material.transparent = entry.mesh.material.opacity < 1;
        entry.label.element.classList.toggle('patio-agent', factoryRoomAt(point) === 'patio');
        entry.label.element.classList.toggle('garage-agent', factoryRoomAt(point) === 'garage');
        entry.label.update(entry.mesh, floorY, camera, canvas, visible, factoryRoomAt(point) === 'factory' ? occluder : undefined, entry.labelFeet);
        let index = 0;
        for (const child of entry.children.values()) {
          const parentPoint = factoryWorldPoint(entry.mesh.position, elevator?.room ?? factoryRoomAt(point));
          const follower = factoryCompanionPosition(parentPoint, index++);
          place(child, follower.x, follower.z, elevator ? { ...elevator, ...factoryScenePoint(follower) } : undefined);
          const childWalkFrame = child.walk.sample(follower, elapsed, moving && !elevator && !effect && !vortex, reduced, .58);
          setFrame(child, working ? 5 : moving ? row : 0, moving && !effect ? childWalkFrame : reduced ? 0 : frame, elevator?.floor ?? floorAt(follower), 0.58);
        }
        if (!elevator?.hidden) anchors.set(agent.sessionId, { x: entry.mesh.position.x, y: entry.mesh.position.y - baseHeight * entry.mesh.scale.y, z: entry.mesh.position.z });
      }
      effects.update(effectState, now, anchors, snapshot.environment, reduced);
      tombstones.update(effectState.tombstones, snapshot.environment, now, camera, showFactory, showPatio, floor, occluder, reduced);
      canvas.dataset.liveEffects = String(effectState.effects.size);
      canvas.dataset.liveVortex = effectState.vortex?.id ?? '';
    },
    dispose() { contributions.dispose(); stopEffects(); effects.dispose(); tombstones.dispose(); effectState.clear(); for (const entry of entries.values()) { removeSprite(entry); entry.label.dispose(); entry.children.forEach(removeSprite); } entries.clear(); },
  };
}
