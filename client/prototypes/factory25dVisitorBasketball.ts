import * as THREE from 'three';
import { createBasketballFloorMarker } from './factory25dFloorMarker';
import { validHorseSpot, HORSE_RELEASE_Y } from '@shared/basketball-challenge';
import {blendCameraPose,cameraPose} from './factory25dCameraMotion';
import {VISITOR_BALL_RIM, type BallVector} from '@shared/visitor-basketball';
import { VISITOR_BALL_RADIUS as RADIUS, visitorPullVelocity, stepVisitorBall, validBallVector, validBallRoom,
  visitorBallFloor, visitorShotVelocity, type FlyingBall } from '@shared/visitor-basketball';
import type { FactoryRoom } from '@shared/factory25d-layout';
import { visitorBallExit } from '@shared/visitor-ball-travel';
import { miniBall } from './factory25dBasketball';
import { onFactoryMessage, onFactoryConnection, sendVisitorBall } from './factory25dBoardData';
import './factory25dVisitorBasketball.css';

const pendingResults = new WeakSet<FlyingBall>();

type Sounds = { result?(made: boolean): void; rim?(energy: number): void; swish(): void; bounce(energy: number): void };
type Rooms = { factory: THREE.Object3D; patio: THREE.Object3D; garage: THREE.Object3D;
  current(): FactoryRoom; visit(room: FactoryRoom): void; transitioning(): boolean };
type LocalBall = { index: number; mesh: THREE.Group; physics: FlyingBall;
  flight: boolean; ride?: { target: FactoryRoom; elapsed: number }; portalCooldown: number };
/** One recorded release: from a marked spot (matching) or wherever the ball stands (setting). Reported, never scored, here. */
export type ArmedShot = { spot?: BallVector; hooks: { shot(position: BallVector, velocity: BallVector): void; done(): void; placement?: { name: string; spot: BallVector; send(spot: BallVector): Promise<void> } } };
const HOVER = 1.05, LIFT_SECONDS = .45, DRIBBLE_GRAVITY = 19.6, DRIBBLE_PUSH = 3.6, APPROACH_LIFT_AT = .82;

/** Click a ball for shooting mode; drag in the room to carry and drop a ball. */
export function createVisitorBasketball(parent: THREE.Group, canvas: HTMLCanvasElement,
  pickups: THREE.Group[], canPick: (index: number) => boolean, sounds: Sounds, rooms: Rooms,
  pickupShadows: THREE.Object3D[] = []) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const locals = new Map<number, LocalBall>();
  let placingShot = false, replayView = false, returnCarry = false, confirmPlacement = false;
  let handoff: ArmedShot['hooks']['placement'], sending = false, placementError = '';
  let sentAt = 0, sentPosition = new THREE.Vector3(), sentLabel = '';
  const lastCursor = new THREE.Vector2(); let hasCursor = false;
  let selected: LocalBall | undefined, camera: THREE.Camera, available = false;
  let pointerId: number | undefined, gesture: 'aim' | 'move' = 'aim', downAt = 0, dragging = false;
  let pendingPickup: number | undefined;
  let round: ArmedShot | undefined, roundShot = false, armed: ArmedShot | undefined;
  const carryOffset=new THREE.Vector3();
  let lastSend = -Infinity, keyboardPower = 55, keyboardAngle = 0;
  // Shooting mode: the camera approaches while the ball rests on the floor; the ball lifts only near the end of that approach.
  let basketballMode=false,viewBlend=0,reloadAt=0,modeIndex=0;
  let phase:'approach'|'lifting'|'ready'|'dribble'='approach',liftProgress=0,dribbleVy=0,dribbleRising=false;
  const exitListeners = new Set<() => void>();
  const closeCamera=new THREE.PerspectiveCamera(48,1,.05,100),targetCamera=new THREE.OrthographicCamera();
  const ready=new THREE.Vector3(),springVelocity=new THREE.Vector3(),springTarget=new THREE.Vector3(),springDelta=new THREE.Vector3();
  const focusPoint=new THREE.Vector3(),sightPoint=new THREE.Vector3(),cameraOffset=new THREE.Vector3(),cameraDirection=new THREE.Vector3();
  const shotForward=new THREE.Vector3(0,0,-1),shotRight=new THREE.Vector3(1,0,0);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const down = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3(), pullStart = new THREE.Vector3(), pull = new THREE.Vector3();
  const hint = document.createElement('div'); hint.className = 'visitor-ball-hint pixel-island'; hint.hidden = true;
  hint.innerHTML = '<span>swipe to shoot · tap to dribble</span><button type="button" data-action="back">back to room</button>';
  document.body.append(hint);
  const hintText = hint.querySelector('span')!;
  const placementHint = document.createElement('div'); placementHint.className = 'visitor-ball-placement'; placementHint.hidden = true;
  const placementLabel = document.createElement('span'); placementHint.append(placementLabel);
  const confirmButton = document.createElement('button'); confirmButton.type = 'button'; confirmButton.textContent = 'confirm'; confirmButton.hidden = true; placementHint.append(confirmButton);
  confirmButton.addEventListener('click', () => { void confirmDrop(); }, events);
  async function confirmDrop() {
    if (!selected || sending) return;
    if (!handoff) { putDown(); return; }
    const current = handoff, spot = { ...selected.physics.position, y: HOVER }, placedPosition = selected.mesh.position.clone();
    sending = true; placementError = '';
    try {
      await current.send(spot);
      sentPosition.copy(placedPosition); sentAt = performance.now(); sentLabel = `Sent · ${current.name} shoots from here`;
      handoff = undefined; putDown(); status.textContent = sentLabel;
    } catch (error) { placementError = error instanceof Error ? error.message : 'Could not send. Try again.'; status.textContent = placementError; }
    finally { sending = false; }
  }
  document.body.append(placementHint);
  const dropRing = createBasketballFloorMarker(parent);
  function previewDrop() {
    if (!selected || sending) return;
    returnCarry = false; confirmPlacement = true; canvas.classList.remove('holding-basketball');
    selected.physics.position.y = floorY(selected); selected.mesh.position.copy(selected.physics.position); send('hold');
    status.textContent = 'Confirm this spot, or drag the ball to move it.';
  }
  const status = document.createElement('span'); status.className = 'visitor-ball-status'; status.setAttribute('role', 'status'); document.body.append(status);
  const triggers = pickups.map((_, index) => {
    const button = document.createElement('button'); button.className = 'visitor-ball-pickup'; button.type = 'button';
    button.setAttribute('aria-label', `Pick up basketball ${index + 1}`);
    canvas.parentElement!.append(button); return button;
  });
  const aimMaterial = new THREE.LineDashedMaterial({ color: '#b6c9c2', transparent: true, opacity: .5, dashSize: .045, gapSize: .035 });
  const aimGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(45), 3));
  const aimLine = new THREE.Line(aimGeometry, aimMaterial); aimLine.visible = false; aimLine.frustumCulled = false; parent.add(aimLine);
  const roomOf = (ball: LocalBall) => ball.physics.room ?? 'factory';
  const floorY = (ball: LocalBall) => visitorBallFloor(ball.physics.position, roomOf(ball)) + RADIUS;
  function send(phase: 'hold' | 'throw', ball = selected) {
    if (!ball) return;
    sendVisitorBall({ type: 'visitor_ball', phase, room: roomOf(ball), position: { ...ball.physics.position },
      ...(phase === 'throw' ? { velocity: { ...ball.physics.velocity } } : {}) }); lastSend = performance.now();
  }
  function keyboardAim() {
    const strength = keyboardPower / 100 * 2.5;
    if (basketballMode) pull.set(0, 0, -strength);
    else pull.set(Math.sin(keyboardAngle) * strength, 0, -Math.cos(keyboardAngle) * strength);
    aim();
  }
  function shotVelocity(){
    if(!basketballMode)return visitorPullVelocity(pull);
    if(!selected)return {x:0,y:0,z:0};
    // A medium upward swipe reaches the rim from this ball's actual release point.
    // Forgive moderate power variation; larger errors still land short or long.
    const distance=Math.hypot(VISITOR_BALL_RIM.x-selected.physics.position.x,VISITOR_BALL_RIM.z-selected.physics.position.z);
    const power=THREE.MathUtils.clamp(-pull.z/1.375,0,2);
    const error=power-1;
    const powerError=Math.sign(error)*Math.max(0,Math.abs(error)-.2);
    const target=new THREE.Vector3(VISITOR_BALL_RIM.x,VISITOR_BALL_RIM.y,VISITOR_BALL_RIM.z)
      .addScaledVector(shotForward,powerError*Math.max(.45,distance*.28))
      .addScaledVector(shotRight,pull.x*.28);
    const dx = target.x - selected.physics.position.x, dz = target.z - selected.physics.position.z;
    target.x = selected.physics.position.x + dx * Math.cos(keyboardAngle) - dz * Math.sin(keyboardAngle);
    target.z = selected.physics.position.z + dx * Math.sin(keyboardAngle) + dz * Math.cos(keyboardAngle);
    return visitorShotVelocity(selected.physics.position,target);
  }
  function aim() {
    if (!selected || gesture === 'move' || (basketballMode && phase !== 'ready' && phase !== 'dribble')) { aimLine.visible = false; return; }
    rooms[roomOf(selected)].add(aimLine);
    const trial: FlyingBall = { ...selected.physics, position: { ...selected.physics.position }, velocity: shotVelocity(), scored: false };
    const points = aimGeometry.getAttribute('position') as THREE.BufferAttribute;
    // Show only the start of the arc: strength and direction still require judgment.
    for (let i = 0; i < points.count; i++) { points.setXYZ(i, trial.position.x, trial.position.y, trial.position.z); stepVisitorBall(trial, .025); }
    points.needsUpdate = true; aimLine.computeLineDistances(); aimLine.visible = true;
  }
  function releasePointer() {
    const id = pointerId; pointerId = undefined; pendingPickup=undefined;
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.classList.remove('holding-basketball');
  }
  /** Leave shooting mode. The ball stays wherever it is; callers decide whether to drop or shelve it. */
  function leaveMode() {
    if (!basketballMode) return;
    basketballMode=false;reloadAt=0;round=undefined;roundShot=false;document.body.classList.remove('basketball-mode');
    hint.hidden = true; hintText.textContent = 'swipe to shoot · tap to dribble'; aimLine.visible = false;
    for (const listener of exitListeners) listener();
  }
  function dropSelected() {
    if (!selected) return;
    selected.physics.velocity = { x: 0, y: 0, z: 0 }; selected.flight = true; send('throw'); selected = undefined;
  }
  function putDown() {
    if (sending && handoff) return;
    handoff = undefined;
    returnCarry = false; confirmPlacement = false;
    const cancelled = placingShot ? armed : undefined; placingShot = false; if (cancelled) { armed = undefined; cancelled.hooks.done(); }
    releasePointer(); leaveMode(); aimLine.visible = false; hint.hidden = true;
    dropSelected();
  }
  function disposeBall(mesh: THREE.Object3D) {
    mesh.removeFromParent(); mesh.traverse(child => { if (child instanceof THREE.Mesh) {
      child.geometry.dispose(); for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    } });
  }
  function shelve(ball: LocalBall) {
    locals.delete(ball.index); disposeBall(ball.mesh);
    pickups[ball.index].visible = true; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = true;
  }
  function putBack() {
    if (sending) return;
    handoff = undefined;
    returnCarry = false; confirmPlacement = false;
    const cancelled = placingShot ? armed : undefined; placingShot = false; if (cancelled) { armed = undefined; cancelled.hooks.done(); }
    const wasMode = basketballMode, index = modeIndex;
    releasePointer(); leaveMode();
    const ball = selected ?? (wasMode ? locals.get(index) : undefined); selected = undefined;
    if (ball && !ball.ride) { shelve(ball); sendVisitorBall({ type: 'visitor_ball', phase: 'cancel' }); }
    hint.hidden = true; aimLine.visible = false;
  }
  /** Rest the ball on the floor at the release spot; it lifts once the camera has nearly arrived. */
  function enterMode(ball: LocalBall, spot?: BallVector) {
    if (placingShot && !validHorseSpot({ ...ball.physics.position, y: HORSE_RELEASE_Y })) { status.textContent = 'Choose a clear spot on the floor.'; return; }
    placingShot = false;
    const floor = visitorBallFloor(ball.physics.position, 'factory');
    if (spot) ready.set(spot.x, floor + HOVER, spot.z);
    else if (!basketballMode || modeIndex !== ball.index) ready.set(ball.physics.position.x, floor + HOVER, ball.physics.position.z);
    shotForward.set(VISITOR_BALL_RIM.x-ready.x,0,VISITOR_BALL_RIM.z-ready.z).normalize();
    shotRight.set(-shotForward.z,0,shotForward.x);
    const wasMode = basketballMode;
    if (!wasMode) { keyboardAngle = 0; keyboardPower = 55; }
    if (!round && armed && !armed.spot) { round = armed; armed = undefined; roundShot = false; }
    basketballMode=true;modeIndex=ball.index;document.body.classList.add('basketball-mode');
    ball.physics.position.x = ready.x; ball.physics.position.z = ready.z; ball.physics.position.y = floor + RADIUS;
    ball.physics.velocity = { x: 0, y: 0, z: 0 }; springVelocity.set(0,0,0); pull.set(0,0,0);
    // A ball chosen while the camera is already close skips the approach wait.
    phase = wasMode && viewBlend >= APPROACH_LIFT_AT ? 'lifting' : 'approach'; liftProgress = 0;
    hint.hidden = false; gesture = 'aim';
    status.textContent = 'basketball mode. swipe the ball upward and release to shoot, tap it to dribble. A/D or left/right arrows aim; up/down arrows adjust power. Space shoots. Escape returns to the room.';
  }
  function begin(index: number, shooting = true, spot?: BallVector) {
    if (!available || (!locals.has(index) && !canPick(index))) return false;
    let ball = locals.get(index);
    if (ball?.ride) return false;
    if (selected && selected !== ball) { if (basketballMode) dropSelected(); else putDown(); }
    if (!ball) {
      const mesh = miniBall(parent);
      ball = { index, mesh, physics: { position: { ...pickups[index].position }, velocity: { x: 0, y: 0, z: 0 }, scored: false, room: 'factory' }, flight: false, portalCooldown: 0 };
      locals.set(index, ball); pickups[index].visible = false; if (pickupShadows[index]) pickupShadows[index].visible = false;
    }
    selected = ball; reloadAt = 0; ball.flight = false; ball.physics.scored = false;
    if (shooting && roomOf(ball) === 'factory') enterMode(ball, spot);
    else if (shooting) {
      // Outside the factory the original pull-back throw still applies: no hoop, no close-up.
      leaveMode();
      ball.physics.position.y = Math.max(ball.physics.position.y, visitorBallFloor(ball.physics.position, roomOf(ball)) + .55);
      hint.hidden = false; gesture = 'aim'; status.textContent = 'pull back and release to throw.'; keyboardAim();
    } else {
      leaveMode();
      ball.physics.position.y = placingShot ? Math.max(ball.physics.position.y, floorY(ball)) : floorY(ball); hint.hidden = !placingShot; gesture = 'move';
    }
    ball.mesh.position.copy(ball.physics.position); aimLine.visible = false; send('hold'); return true;
  }
  function pointerPoint(x: number, y: number) {
    if (!selected) return false;
    const bounds = canvas.getBoundingClientRect(), host = rooms[roomOf(selected)];
    ray.setFromCamera(new THREE.Vector2((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2), camera);
    host.updateWorldMatrix(true, false);
    plane.constant = -host.localToWorld(point.set(0, selected.physics.position.y, 0)).y;
    if (!ray.ray.intersectPlane(plane, point)) return false;
    host.worldToLocal(point); return true;
  }
  function drag(event: PointerEvent) {
    if (sending || handoff) { releasePointer(); return; }
    if(pendingPickup!==undefined){
      if(down.distanceTo(new THREE.Vector2(event.clientX,event.clientY))<=5)return;
      const index=pendingPickup;pendingPickup=undefined;
      if(!begin(index,false)){releasePointer();return;}
      if(pointerPoint(down.x,down.y))carryOffset.copy(selected!.mesh.position).sub(point);else carryOffset.set(0,0,0);
      dragging=true;
    }
    if (!selected || (!basketballMode&&!pointerPoint(event.clientX, event.clientY))) return;
    const distance = down.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    if (!dragging && distance > 5) { dragging = true; if (!basketballMode&&performance.now() - downAt > 300) gesture = 'move'; }
    if (gesture === 'move') {
      const room = roomOf(selected), p = selected.physics.position;
      p.x = THREE.MathUtils.clamp(point.x+carryOffset.x, room === 'patio' ? 8.1 : room === 'garage' ? -11.6 : -7.7, room === 'patio' ? 23.9 : room === 'garage' ? 11.6 : 7.7);
      p.z = THREE.MathUtils.clamp(point.z+carryOffset.z, room === 'factory' ? -6.1 : -4.2, room === 'garage' ? 15.8 : room === 'factory' ? 11.65 : 13.6);
      p.y = visitorBallFloor(p, room) + (placingShot ? .55 : RADIUS);
      selected.mesh.position.copy(p); if (performance.now() - lastSend > 75) send('hold');
    } else if(basketballMode)pull.set(THREE.MathUtils.clamp((event.clientX-down.x)*.008,-1.5,1.5),0,-THREE.MathUtils.clamp((down.y-event.clientY)*.008,0,2.5));
    else pull.subVectors(pullStart, point).setY(0);
    aim();
  }
  /** A tap on the ready ball pushes it to the floor; it bounces back to hover height. Never a shot. */
  function dribble() {
    if (!selected || !basketballMode || (phase !== 'ready' && phase !== 'dribble')) return;
    if (round?.spot) return; // A matching release must leave from the marked hover point.
    phase = 'dribble'; dribbleVy = Math.min(dribbleRising ? 0 : dribbleVy, -DRIBBLE_PUSH); dribbleRising = false; pull.set(0,0,0); aimLine.visible = false;
    status.textContent = 'dribble';
  }
  function shoot() {
    if (!selected) return;
    if(basketballMode&&(pull.z>=-.025||(phase!=='ready'&&phase!=='dribble')||(round?.spot&&phase!=='ready'))){releasePointer();pull.set(0,0,0);return;}
    const ball = selected;
    pendingResults.add(ball.physics);
    ball.physics.velocity = shotVelocity(); ball.physics.scored = false;
    ball.flight = true; send('throw'); selected = undefined;
    releasePointer(); aimLine.visible = false; hint.hidden = !basketballMode;
    if (basketballMode) {
      reloadAt = performance.now() + 1800;
      if (round && !roundShot) { roundShot = true; round.hooks.shot({ ...ball.physics.position }, { ...ball.physics.velocity }); }
    }
    canvas.dataset.visitorBall = 'flying'; status.textContent = 'shot away';
  }
  /** After a shot lands: the next release from the floor, or the end of a round. */
  function reload() {
    reloadAt = 0;
    const ball = locals.get(modeIndex);
    if (!ball || ball.ride || roomOf(ball) !== 'factory' || !available) { leaveMode(); return; }
    if (round && roundShot) {
      const hooks = round.hooks; releasePointer(); leaveMode();
      if (!hooks.placement) { hooks.done(); return; }
      handoff = hooks.placement;
      selected = ball; ball.flight = false; ball.physics.velocity = { x: 0, y: 0, z: 0 };
      returnCarry = false; confirmPlacement = true; gesture = 'move'; hint.hidden = true;
      ball.physics.position = { ...handoff.spot, y: visitorBallFloor(handoff.spot, 'factory') + RADIUS };
      ball.mesh.position.copy(ball.physics.position);
      status.textContent = 'Shot made. Confirm to challenge your opponent from this same spot.';
      hooks.done(); return;
    }
    selected = ball; ball.flight = false; ball.physics.scored = false;
    enterMode(ball, round?.spot);
    ball.mesh.position.copy(ball.physics.position); send('hold');
  }
  triggers.forEach((button, index) => {
    button.addEventListener('pointerdown', event => {
      if(event.button!==0 || sending)return;
      const legacyAim = !basketballMode && selected?.index === index && gesture === 'aim';
      if(!basketballMode && !legacyAim){
        if(!available||(!locals.has(index)&&!canPick(index))||locals.get(index)?.ride)return;
        event.preventDefault();event.stopPropagation();pendingPickup=index;pointerId=event.pointerId;
        down.set(event.clientX,event.clientY);downAt=performance.now();dragging=false;carryOffset.set(0,0,0);
        canvas.setPointerCapture(pointerId);canvas.classList.add('holding-basketball');return;
      }
      if(basketballMode && selected?.index !== index){ event.preventDefault(); event.stopPropagation(); begin(index); return; }
      event.preventDefault(); event.stopPropagation(); pointerId = event.pointerId; down.set(event.clientX, event.clientY);
      downAt = performance.now(); dragging = false; pull.set(0,0,0);
      if (pointerPoint(event.clientX, event.clientY)) pullStart.copy(point);
      canvas.setPointerCapture(pointerId); canvas.classList.add('holding-basketball');
    }, events);
    // Keyboard activation: enter shooting mode, or dribble the ball that is already ready.
    button.addEventListener('click', event => {
      if (event.detail !== 0) return;
      if (basketballMode && selected?.index === index) dribble(); else if (begin(index)) button.focus();
    }, events);
  });
  document.addEventListener('pointermove', event => {
    lastCursor.set(event.clientX, event.clientY); hasCursor = true;
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); drag(event);
  }, { ...events, capture: true });
  document.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    drag(event);
    if (sending || handoff) { releasePointer(); return; }
    if(pendingPickup!==undefined){const index=pendingPickup;releasePointer();if (confirmPlacement) { confirmPlacement = false; returnCarry = true; } else begin(index);return;}
    releasePointer();
    if (!dragging) { if (basketballMode) dribble(); else keyboardAim(); return; }
    if (gesture === 'move') { if (confirmPlacement) previewDrop(); else if (!placingShot) putDown(); } else {
      if(basketballMode){const seconds=Math.max(.12,(performance.now()-downAt)/1000);pull.multiplyScalar(THREE.MathUtils.clamp(.8+.12/seconds,.85,1.5));}
      shoot();
    }
  }, { ...events, capture: true });
  function interruptGesture() {
    if (basketballMode || placingShot || handoff || returnCarry) {
      // Losing app focus cancels the gesture, not the player's turn or placement.
      releasePointer(); pull.set(0,0,0); aimLine.visible = false;
    } else if (selected) putDown();
    else releasePointer();
  }
  canvas.addEventListener('pointercancel', interruptGesture, events);
  canvas.addEventListener('lostpointercapture', () => { if (pointerId !== undefined) interruptGesture(); }, events);
  hint.querySelector('[data-action="back"]')!.addEventListener('click',putBack,events);
  document.addEventListener('keydown', event => {
    if (!selected && !basketballMode) return;
    const target = event.target as HTMLElement;
    if (target.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); putBack(); return; }
    const key = event.code === 'Space' ? ' ' : event.code === 'KeyA' ? 'ArrowLeft' : event.code === 'KeyD' ? 'ArrowRight' : event.key;
    if (!selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(key)) return;
    // Let Enter activate the island's Back button normally.
    if ((key === 'Enter' || key === ' ') && target.closest?.('.factory-toolbar, .visitor-ball-hint')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (returnCarry || confirmPlacement) { if ((key === 'Enter' || key === ' ') && viewBlend <= .01 && !event.repeat) { if (returnCarry) previewDrop(); else void confirmDrop(); } return; }
    if (placingShot) {
      const p = selected.physics.position;
      if (key === 'Enter' || key === ' ') { if (!event.repeat) enterMode(selected); return; }
      const next = { x: p.x + (key === 'ArrowLeft' ? -.15 : key === 'ArrowRight' ? .15 : 0), y: HORSE_RELEASE_Y, z: p.z + (key === 'ArrowUp' ? -.15 : key === 'ArrowDown' ? .15 : 0) };
      if (validHorseSpot(next)) { p.x = next.x; p.z = next.z; selected.mesh.position.copy(p); send('hold'); }
      return;
    }
    if (key === 'ArrowLeft') keyboardAngle = Math.max(-Math.PI / 3, keyboardAngle - .04);
    else if (key === 'ArrowRight') keyboardAngle = Math.min(Math.PI / 3, keyboardAngle + .04);
    else if (key === 'ArrowUp') keyboardPower = Math.min(100, keyboardPower + 5);
    else if (key === 'ArrowDown') keyboardPower = Math.max(10, keyboardPower - 5);
    else { if (!event.repeat) { keyboardAim(); shoot(); } return; }
    keyboardAim();
    status.textContent = `Aim ${Math.round(keyboardAngle * 180 / Math.PI)} degrees, power ${keyboardPower} percent. Space to shoot.`;
  }, { ...events, capture: true });
  document.addEventListener('pointerdown', event => {
    if (!returnCarry || !selected || viewBlend > .01 || (event.target as Element).closest?.('.factory-toolbar, button, input, a, select')) return;
    event.preventDefault(); event.stopImmediatePropagation(); previewDrop();
  }, { ...events, capture: true });
  document.addEventListener('pointerdown', event => {
    if (placingShot && selected && event.target === canvas && pointerId === undefined && pointerPoint(event.clientX, event.clientY)) {
      const spot = { x: point.x, y: HORSE_RELEASE_Y, z: point.z };
      if (validHorseSpot(spot)) { selected.physics.position.x = spot.x; selected.physics.position.z = spot.z; enterMode(selected); }
      else status.textContent = 'Choose a clear spot on the floor.';
      return;
    }
    if (selected && pointerId === undefined && event.target !== canvas && !hint.contains(event.target as Node) && !placementHint.contains(event.target as Node)
      && !(event.target as Element).closest?.('.factory-toolbar, .horse-spot-hotspot, .basketball-challenge-picker')
      && !triggers.some(button => button.contains(event.target as Node))) putDown();
  }, events);
  window.addEventListener('blur', interruptGesture, events);
  document.addEventListener('visibilitychange', () => { if (document.hidden) interruptGesture(); }, events);

  type Ghost = { mesh: THREE.Group; physics?: FlyingBall; seen: number; age: number; room: FactoryRoom };
  const ghosts = new Map<string, Ghost>();
  function removeGhost(id: string) { const ghost = ghosts.get(id); if (ghost) { disposeBall(ghost.mesh); ghosts.delete(id); } }
  const stopMessages = onFactoryMessage(message => {
    if (message.type !== 'visitor_ball_update' || typeof message.visitorId !== 'string') return;
    if (message.phase === 'cancel') { removeGhost(message.visitorId); return; }
    const room = validBallRoom(message.room) ? message.room : 'factory';
    if (!validBallVector(message.position, false, room) || message.phase === 'throw' && !validBallVector(message.velocity, true)) return;
    let ghost = ghosts.get(message.visitorId);
    if (!ghost) {
      if (ghosts.size >= 64) return;
      const mesh = miniBall(rooms[room]); mesh.name = 'ghost-basketball';
      mesh.traverse(child => { if (child instanceof THREE.Mesh) { const m = child.material as THREE.MeshStandardMaterial; m.transparent = true; m.opacity = .55; m.depthWrite = false; child.castShadow = false; } });
      ghost = { mesh, seen: performance.now(), age: 0, room }; ghosts.set(message.visitorId, ghost);
    }
    rooms[room].add(ghost.mesh); ghost.room = room; ghost.seen = performance.now(); ghost.age = 0; ghost.mesh.position.copy(message.position);
    ghost.physics = message.phase === 'throw' ? { position: { ...message.position }, velocity: { ...message.velocity! }, scored: false, room } : undefined;
    if (ghost.physics) {
      let delay = Math.min(8, Math.max(0, (Date.now() - message.serverTime) / 1000));
      ghost.age = delay; while (delay > 0) { stepVisitorBall(ghost.physics, Math.min(.1, delay)); delay -= .1; }
    }
  });
  const stopConnection = onFactoryConnection(connected => { if (!connected) { if (selected) putDown(); for (const id of ghosts.keys()) removeGhost(id); } });
  function portal(ball: LocalBall, dt: number) {
    ball.portalCooldown = Math.max(0, ball.portalCooldown - dt);
    if (ball.ride) {
      ball.ride.elapsed += dt;
      if (ball.ride.elapsed >= 1.05 && roomOf(ball) !== ball.ride.target) {
        ball.physics.room = ball.ride.target; rooms[roomOf(ball)].add(ball.mesh);
        ball.physics.position = { x: roomOf(ball) === 'garage' ? -10.5 : -7.1, y: RADIUS, z: roomOf(ball) === 'garage' ? -3 : -4.95 };
        send('hold', ball);
      }
      if (ball.ride.elapsed >= 2.35) {
        ball.ride = undefined; ball.flight = true; ball.portalCooldown = 4;
        ball.physics.velocity = { x: .15, y: .3, z: 1.4 }; send('throw', ball);
      }
      return;
    }
    const p = ball.physics.position, room = roomOf(ball);
    if (ball.portalCooldown || selected === ball || !ball.flight) return;
    const exit = visitorBallExit(p, room);
    if (!exit) return;
    // A shooting-mode ball that leaves the court ends the close-up; the room follows the ball as before.
    if (basketballMode && ball.index === modeIndex) leaveMode();
    if (exit.kind === 'elevator') {
      const target = exit.room;
      ball.ride = { target, elapsed: 0 }; ball.physics.velocity = { x: 0, y: 0, z: 0 };
      if (rooms.current() === room) rooms.visit(target);
      status.textContent = 'the basketball is taking the elevator'; return;
    }
    // The open patio doorway is a continuous threshold between the two rooms.
    const next = exit.room;
    Object.assign(p, exit.position);
    ball.physics.room = next; ball.portalCooldown = 1;
    rooms[next].add(ball.mesh); send('hold', ball); send('throw', ball);
    if (rooms.current() === room) rooms.visit(next);
  }
  /** Ball motion while it is the shooter's: approach rest, lift, hover spring, dribble. */
  function updateHeld(dt: number) {
    if (!basketballMode || !selected || gesture !== 'aim') return;
    const ball = selected, p = ball.physics.position, floor = visitorBallFloor(p, 'factory') + RADIUS;
    if (phase === 'approach') {
      if (viewBlend >= APPROACH_LIFT_AT || reducedMotion.matches) { phase = 'lifting'; liftProgress = 0; }
      else { p.x = ready.x; p.z = ready.z; p.y = floor; }
    }
    if (phase === 'lifting') {
      liftProgress = reducedMotion.matches ? 1 : Math.min(1, liftProgress + dt / LIFT_SECONDS);
      const t = liftProgress * liftProgress * (3 - 2 * liftProgress);
      p.x = ready.x; p.z = ready.z; p.y = THREE.MathUtils.lerp(floor, ready.y, t);
      if (liftProgress >= 1) { phase = 'ready'; springVelocity.set(0,0,0); ball.mesh.position.copy(p); }
    } else if (phase === 'dribble') {
      let left = Math.min(dt, .1);
      while (left > 0) {
        const step = Math.min(left, 1/120); left -= step;
        dribbleVy -= DRIBBLE_GRAVITY * step; p.y += dribbleVy * step;
        if (p.y <= floor) { p.y = floor; dribbleVy = Math.sqrt(2 * DRIBBLE_GRAVITY * (ready.y - floor)); dribbleRising = true; sounds.bounce(.65); }
        // The rise is sized to end at hover height; settle at the apex rather than chasing an exact float.
        if (dribbleRising && dribbleVy <= 0) { p.y = ready.y; phase = 'ready'; dribbleRising = false; springVelocity.set(0,0,0); status.textContent = 'ready'; break; }
      }
      p.x = ready.x; p.z = ready.z;
    } else if (phase === 'ready') {
      springTarget.copy(ready).addScaledVector(shotRight,pull.x*.18).addScaledVector(shotForward,pointerId===undefined?0:Math.abs(pull.z)*.18);
      springTarget.y+=(reducedMotion.matches?0:Math.sin(performance.now()*.0025)*.025)+(pointerId===undefined?0:Math.abs(pull.z)*.12);
      for(let left=Math.min(dt,.1);left>0;){const step=Math.min(left,1/120);left-=step;
        springVelocity.addScaledVector(springDelta.copy(springTarget).sub(ball.mesh.position),150*step).multiplyScalar(Math.exp(-15*step));ball.mesh.position.addScaledVector(springVelocity,step);}
      Object.assign(p, ball.mesh.position);
    }
    ball.mesh.position.copy(p); aim();
  }
  return {
    cameraFor(base:THREE.OrthographicCamera,dt:number){
      viewBlend=THREE.MathUtils.clamp(viewBlend+((basketballMode || replayView)?1:-1)*dt/.65,0,1);
      if(reducedMotion.matches)viewBlend=(basketballMode || replayView)?1:0;
      document.body.classList.toggle('basketball-input-active', basketballMode || replayView || viewBlend > 0 || !!selected || pendingPickup !== undefined);
      if(viewBlend===0)return base;
      parent.localToWorld(focusPoint.copy(ready));
      parent.localToWorld(sightPoint.copy(ready).lerp(cameraOffset.set(VISITOR_BALL_RIM.x,1.4,VISITOR_BALL_RIM.z),.5));
      targetCamera.copy(base);targetCamera.position.copy(parent.localToWorld(cameraOffset.copy(ready).addScaledVector(shotForward,-1.8).add(springDelta.set(0,.4,0))));targetCamera.lookAt(sightPoint);
      const target=cameraPose(targetCamera);target.height=2.8;
      const height=blendCameraPose(closeCamera,cameraPose(base),target,viewBlend,focusPoint);
      closeCamera.aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
      // Start with a long lens matching the room, then open into true perspective.
      closeCamera.fov=THREE.MathUtils.lerp(1,48,viewBlend);
      const distance=height/(2*Math.tan(THREE.MathUtils.degToRad(closeCamera.fov/2)));
      closeCamera.getWorldDirection(cameraDirection);
      const depth=cameraOffset.copy(focusPoint).sub(closeCamera.position).dot(cameraDirection);
      closeCamera.position.addScaledVector(cameraDirection,depth-distance);
      closeCamera.far=Math.max(100,distance+80);closeCamera.updateProjectionMatrix();closeCamera.updateMatrixWorld();
      return closeCamera;
    },
    showReplayView(spot?: BallVector) {
      replayView = !!spot;
      if (spot) { ready.set(spot.x, spot.y, spot.z); shotForward.set(VISITOR_BALL_RIM.x - ready.x, 0, VISITOR_BALL_RIM.z - ready.z).normalize(); shotRight.set(-shotForward.z, 0, shotForward.x); }
    },
    get busy() { return locals.has(0) || !!selected; },
    get shooting() { return basketballMode; },
    get shotInFlight() { return basketballMode && reloadAt > 0; },
    onExit(listener: () => void) { exitListeners.add(listener); return () => { exitListeners.delete(listener); }; },
    get cameraActive() { return basketballMode || replayView || viewBlend > 0; },
    get shotDistance() { return Math.hypot(ready.x - VISITOR_BALL_RIM.x, ready.z - VISITOR_BALL_RIM.z); },
    setHint(text?: string, letters?: string) {
      const caption = text ?? 'swipe to shoot · tap to dribble';
      const signature = JSON.stringify([caption, letters]);
      if (hintText.dataset.horseHint === signature && hintText.textContent?.startsWith(caption)) return;
      hintText.dataset.horseHint = signature; hintText.textContent = caption;
      if (letters !== undefined) {
        const score = document.createElement('span'); score.className = 'horse-turn-letters';
        score.setAttribute('aria-label', `Your HORSE letters: ${letters || 'none'}`);
        for (const [index, letter] of [...'HORSE'].entries()) {
          const cell = document.createElement('span'); cell.textContent = letter;
          cell.className = index < letters.length ? 'is-earned' : ''; cell.setAttribute('aria-hidden', 'true'); score.append(cell);
        }
        hintText.append(score);
      }
    },
    /** Arm the next release. With a spot, shooting mode starts there now; without one, the next shot the player
     * takes from wherever they carried the ball is the recorded set. Returns false only when a spot could not be entered. */
    armShot(hooks: ArmedShot['hooks'], spot?: BallVector) {
      if (!spot) {
        if (basketballMode && !round) { round = { hooks }; roundShot = false; return true; }
        const index = [1, 0].find(i => available && rooms.current() === 'factory' && (locals.has(i) || canPick(i)) && !locals.get(i)?.ride);
        if (index === undefined || !begin(index, false)) return false;
        armed = { hooks }; placingShot = true;
        hint.hidden = false; hintText.textContent = 'drag to choose a spot · click the ball to aim';
        status.textContent = 'Your turn. Drag the ball to choose a spot, then click it to aim. You can also click a clear floor spot. Arrow keys move the ball; Enter aims.';
        return true;
      }
      const index = [1, 0].find(i => available && rooms.current() === 'factory' && (locals.has(i) || canPick(i)) && !locals.get(i)?.ride);
      if (index === undefined) return false;
      armed = undefined; round = { spot, hooks }; roundShot = false;
      if (!begin(index, true, spot)) { round = undefined; return false; }
      return true;
    },
    /** Stage the matching ball on its mark without entering the camera or recording a shot. */
    placeMatchBall(spot: BallVector) {
      if (selected || basketballMode || rooms.current() !== 'factory') return false;
      const index = [1, 0].find(i => available && (locals.has(i) || canPick(i)) && !locals.get(i)?.ride);
      if (index === undefined || !begin(index, false)) return false;
      const ball = locals.get(index)!;
      ball.physics.position = { x: spot.x, y: visitorBallFloor(spot, 'factory') + RADIUS, z: spot.z };
      ball.physics.velocity = { x: 0, y: 0, z: 0 }; ball.flight = false;
      ball.mesh.position.copy(ball.physics.position); send('hold', ball); selected = undefined;
      return true;
    },
    /** Forget an armed release that has not left yet; a round already in flight completes normally. */
    disarm() { if (placingShot) { putBack(); return; } armed = undefined; if (round && !roundShot) { round = undefined; if (basketballMode) putBack(); } },
    get placingChallenge() { return !!handoff; },
    get armedShot() { return !!(round || armed); },
    update(dt: number, view: THREE.Camera, visible: boolean) {
      camera = view; available = visible && !document.body.matches('.avatar-editor-open, .inspect-open, .chat-open, .team-open, .brand-open');
      if ((!available || rooms.current() !== 'factory') && (selected || basketballMode)) putDown();
      if(basketballMode&&reloadAt&&performance.now()>=reloadAt) reload();
      if (placingShot && selected) { selected.physics.position.y = THREE.MathUtils.damp(selected.physics.position.y, visitorBallFloor(selected.physics.position, 'factory') + .55, 10, dt); selected.mesh.position.copy(selected.physics.position); }
      if (returnCarry && selected && viewBlend <= .01) {
        canvas.classList.add('holding-basketball');
        selected.physics.position.y = visitorBallFloor(selected.physics.position, 'factory') + .55;
        if (hasCursor && pointerPoint(lastCursor.x, lastCursor.y)) {
          selected.physics.position.x = THREE.MathUtils.clamp(point.x, -7.7, 7.7);
          selected.physics.position.z = THREE.MathUtils.clamp(point.z, -6.1, 11.65);
        }
        selected.mesh.position.copy(selected.physics.position);
      }
      updateHeld(dt);
      for (const ball of locals.values()) {
        pickups[ball.index].visible = false; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = false;
        portal(ball, dt);
        if (ball.flight && !ball.ride && selected !== ball) {
          const result = stepVisitorBall(ball.physics, dt);
          ball.mesh.rotation.x += dt * Math.hypot(ball.physics.velocity.x, ball.physics.velocity.z) / RADIUS;
          if (rooms.current() === roomOf(ball)) {
            if (pendingResults.has(ball.physics) && (result.swish || result.floorHit)) { sounds.result?.(result.swish || ball.physics.scored); pendingResults.delete(ball.physics); }
            if (result.swish) { sounds.swish(); status.textContent = 'swish!'; canvas.dataset.visitorBasket = String(Number(canvas.dataset.visitorBasket ?? 0) + 1); }
            if (result.rimImpact > 0) sounds.rim?.(result.rimImpact);
            if (result.bounce > .12) sounds.bounce(result.bounce);
          }
          if (Math.hypot(ball.physics.velocity.x, ball.physics.velocity.y, ball.physics.velocity.z) < .025) ball.flight = false;
        }
        ball.mesh.position.copy(ball.physics.position);
      }
      pickups.forEach((pickup, index) => {
        const local = locals.get(index), button = triggers[index];
        button.hidden = !!handoff || returnCarry || !available || !!local?.ride || (local ? roomOf(local) !== rooms.current() : rooms.current() !== 'factory' || !canPick(index));
        if (button.hidden) return;
        const host = local ? rooms[roomOf(local)] : parent;
        host.localToWorld(point.copy(local?.mesh.position ?? pickup.position)).project(camera);
        button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05;
        Object.assign(button.style, { left: `${(point.x + 1) * canvas.clientWidth / 2 - 22}px`, top: `${(1 - point.y) * canvas.clientHeight / 2 - 22}px` });
      });
      const showSent = sentAt > 0 && performance.now() - sentAt < 4500;
      dropRing.visible = (confirmPlacement && !!selected || showSent) && available;
      if (showSent && !selected) dropRing.position.set(sentPosition.x, .012, sentPosition.z);
      if (dropRing.visible && selected) dropRing.position.set(selected.physics.position.x, visitorBallFloor(selected.physics.position, 'factory') + .012, selected.physics.position.z);
      confirmButton.hidden = !confirmPlacement;
      confirmButton.disabled = sending; confirmButton.textContent = sending ? 'Sending…' : handoff ? 'Confirm challenge' : 'confirm';
      placementHint.hidden = !(placingShot || confirmPlacement || (returnCarry && viewBlend <= .01)) || !selected || !available;
      if (showSent && available) placementHint.hidden = false;
      placementLabel.textContent = showSent ? sentLabel : confirmPlacement ? (placementError || (handoff ? `Made it here · ${handoff.name} must match this spot` : 'or drag to move')) : returnCarry ? 'choose their spot · click to drop' : 'drag to choose a spot · click to aim';
      if (placingShot) hint.hidden = true;
      if (!placementHint.hidden && (selected || showSent)) {
        const bounds = canvas.getBoundingClientRect();
        rooms[selected ? roomOf(selected) : 'factory'].localToWorld(point.copy(selected ? selected.mesh.position : sentPosition)).project(camera);
        placementHint.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        const x = bounds.left + (point.x + 1) * bounds.width / 2;
        const y = bounds.top + (1 - point.y) * bounds.height / 2;
        placementHint.style.left = `${THREE.MathUtils.clamp(x, 112, window.innerWidth - 112)}px`;
        placementHint.style.top = `${Math.min(y + 30, window.innerHeight - 65)}px`;
      }
      if (selected && performance.now() - lastSend > 500) send('hold');
      for (const [id, ghost] of ghosts) {
        if (performance.now() - ghost.seen > 8000) { removeGhost(id); continue; }
        if (ghost.physics) { const contact = stepVisitorBall(ghost.physics, dt); if (contact.rimImpact > 0 && rooms.current() === 'factory') sounds.rim?.(contact.rimImpact); ghost.mesh.position.copy(ghost.physics.position); }
      }
      canvas.dataset.visitorBall = selected ? gesture === 'move' ? 'moving' : basketballMode ? phase : 'aiming' : [...locals.values()].some(ball => ball.flight) ? 'flying' : 'resting';
      canvas.dataset.ghostBalls = String(ghosts.size);
    },
    dispose() {
      leaveMode(); exitListeners.clear(); releasePointer(); abort.abort(); stopMessages(); stopConnection();
      for (const id of ghosts.keys()) removeGhost(id);
      for (const ball of locals.values()) { disposeBall(ball.mesh); pickups[ball.index].visible = true; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = true; }
      aimLine.removeFromParent(); aimGeometry.dispose(); aimMaterial.dispose(); triggers.forEach(button => button.remove()); hint.remove(); document.body.classList.remove('basketball-input-active'); dropRing.removeFromParent(); dropRing.geometry.dispose(); dropRing.material.dispose(); placementHint.remove(); status.remove();
    },
  };
}
