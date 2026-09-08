import * as THREE from 'three';
import { VISITOR_BALL_RADIUS as RADIUS, visitorPullVelocity, stepVisitorBall, validBallVector, validBallRoom,
  visitorBallFloor, type FlyingBall } from '@shared/visitor-basketball';
import type { FactoryRoom } from '@shared/factory25d-layout';
import { visitorBallExit } from '@shared/visitor-ball-travel';
import { miniBall } from './factory25dBasketball';
import { onFactoryMessage, onFactoryConnection, sendVisitorBall } from './factory25dBoardData';
import { contactShadow } from './factory25dContactShadows';
import './factory25dVisitorBasketball.css';

type Sounds = { swish(): void; bounce(energy: number): void };
type Rooms = { factory: THREE.Object3D; patio: THREE.Object3D; garage: THREE.Object3D;
  current(): FactoryRoom; visit(room: FactoryRoom): void; transitioning(): boolean };
type LocalBall = { index: number; mesh: THREE.Group; shadow: THREE.Mesh; physics: FlyingBall;
  flight: boolean; ride?: { target: FactoryRoom; elapsed: number }; portalCooldown: number };
/** Pull back to shoot; hold briefly (or choose move) to carry a ball anywhere. */
export function createVisitorBasketball(parent: THREE.Group, canvas: HTMLCanvasElement,
  pickups: THREE.Group[], canPick: (index: number) => boolean, sounds: Sounds, rooms: Rooms,
  pickupShadows: THREE.Object3D[] = []) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const locals = new Map<number, LocalBall>();
  let selected: LocalBall | undefined, camera: THREE.Camera, available = false, moveMode = false;
  let pointerId: number | undefined, gesture: 'aim' | 'move' = 'aim', downAt = 0, dragging = false;
  let lastSend = -Infinity, keyboardPower = 55, keyboardAngle = 0;
  const down = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3(), pullStart = new THREE.Vector3(), pull = new THREE.Vector3();
  const hint = document.createElement('div'); hint.className = 'visitor-ball-hint pixel-island'; hint.hidden = true;
  hint.innerHTML = '<span>pull back to throw · hold to move</span><button type="button" data-action="move" aria-pressed="false">move</button><button type="button" data-action="left" aria-label="Aim basketball left">←</button><button type="button" data-action="right" aria-label="Aim basketball right">→</button><label>power <input type="range" min="10" max="100" value="55" aria-label="Basketball shot power"></label><button type="button" data-action="shoot">throw</button><button type="button" data-action="home">put back</button>';
  document.body.append(hint);
  const status = document.createElement('span'); status.className = 'visitor-ball-status'; status.setAttribute('role', 'status'); document.body.append(status);
  const triggers = pickups.map((_, index) => {
    const button = document.createElement('button'); button.className = 'visitor-ball-pickup'; button.type = 'button';
    button.setAttribute('aria-label', `Pick up basketball ${index + 1}`); button.title = 'pull back to throw · hold to move';
    canvas.parentElement!.append(button); return button;
  });
  const aimMaterial = new THREE.LineDashedMaterial({ color: '#b6c9c2', transparent: true, opacity: .5, dashSize: .045, gapSize: .035 });
  const aimGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(45), 3));
  const aimLine = new THREE.Line(aimGeometry, aimMaterial); aimLine.visible = false; aimLine.frustumCulled = false; parent.add(aimLine);
  const roomOf = (ball: LocalBall) => ball.physics.room ?? 'factory';
  function send(phase: 'hold' | 'throw', ball = selected) {
    if (!ball) return;
    sendVisitorBall({ type: 'visitor_ball', phase, room: roomOf(ball), position: { ...ball.physics.position },
      ...(phase === 'throw' ? { velocity: { ...ball.physics.velocity } } : {}) }); lastSend = performance.now();
  }
  function keyboardAim() {
    const strength = keyboardPower / 100 * 2.5;
    pull.set(Math.sin(keyboardAngle) * strength, 0, -Math.cos(keyboardAngle) * strength); aim();
  }
  function aim() {
    if (!selected || gesture === 'move') { aimLine.visible = false; return; }
    rooms[roomOf(selected)].add(aimLine);
    const trial: FlyingBall = { ...selected.physics, position: { ...selected.physics.position }, velocity: visitorPullVelocity(pull), scored: false };
    const points = aimGeometry.getAttribute('position') as THREE.BufferAttribute;
    // Show only the start of the arc: strength and direction still require judgment.
    for (let i = 0; i < points.count; i++) { points.setXYZ(i, trial.position.x, trial.position.y, trial.position.z); stepVisitorBall(trial, .025); }
    points.needsUpdate = true; aimLine.computeLineDistances(); aimLine.visible = true;
  }
  function releasePointer() {
    const id = pointerId; pointerId = undefined;
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.classList.remove('holding-basketball');
  }
  function putDown() {
    releasePointer(); aimLine.visible = false; hint.hidden = true;
    if (selected) { selected.physics.velocity = { x: 0, y: 0, z: 0 }; selected.flight = true; send('throw'); }
    selected = undefined; moveMode = false;
  }
  function disposeBall(mesh: THREE.Object3D) {
    mesh.removeFromParent(); mesh.traverse(child => { if (child instanceof THREE.Mesh) {
      child.geometry.dispose(); for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    } });
  }
  function putBack() {
    if (!selected) return;
    const ball = selected; releasePointer(); selected = undefined;
    locals.delete(ball.index); disposeBall(ball.mesh); disposeBall(ball.shadow);
    pickups[ball.index].visible = true; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = true;
    hint.hidden = true; aimLine.visible = false; moveMode = false; sendVisitorBall({ type: 'visitor_ball', phase: 'cancel' });
  }
  function begin(index: number) {
    if (!available || (!locals.has(index) && !canPick(index))) return false;
    let ball = locals.get(index);
    if (ball?.ride) return false;
    if (selected && selected !== ball) putDown();
    if (!ball) {
      const mesh = miniBall(parent), shadow = contactShadow(parent, { width: .12, depth: .12, spread: .055, opacity: .25, round: true });
      ball = { index, mesh, shadow, physics: { position: { ...pickups[index].position }, velocity: { x: 0, y: 0, z: 0 }, scored: false, room: 'factory' }, flight: false, portalCooldown: 0 };
      locals.set(index, ball); pickups[index].visible = false; if (pickupShadows[index]) pickupShadows[index].visible = false;
    }
    selected = ball; ball.flight = false; ball.physics.scored = false;
    ball.physics.position.y = Math.max(ball.physics.position.y, visitorBallFloor(ball.physics.position, roomOf(ball)) + .55);
    ball.mesh.position.copy(ball.physics.position); hint.hidden = false; gesture = moveMode ? 'move' : 'aim';
    hint.querySelector('[data-action="move"]')!.setAttribute('aria-pressed', String(moveMode));
    status.textContent = 'pull back and release to throw. hold still briefly before dragging to move the ball.';
    keyboardAim(); send('hold'); return true;
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
    if (!selected || !pointerPoint(event.clientX, event.clientY)) return;
    const distance = down.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
    if (!dragging && distance > 5) { dragging = true; if (performance.now() - downAt > 300) gesture = 'move'; }
    if (gesture === 'move') {
      const room = roomOf(selected), p = selected.physics.position;
      p.x = THREE.MathUtils.clamp(point.x, room === 'patio' ? 8.1 : room === 'garage' ? -11.6 : -7.7, room === 'patio' ? 23.9 : room === 'garage' ? 11.6 : 7.7);
      p.z = THREE.MathUtils.clamp(point.z, room === 'factory' ? -6.1 : -4.2, room === 'garage' ? 15.8 : room === 'factory' ? 11.65 : 13.6);
      p.y = visitorBallFloor(p, room) + .55;
      selected.mesh.position.copy(p); if (performance.now() - lastSend > 75) send('hold');
    } else pull.subVectors(pullStart, point).setY(0);
    aim();
  }
  function shoot() {
    if (!selected) return;
    selected.physics.velocity = visitorPullVelocity(pull); selected.physics.scored = false;
    selected.flight = true; send('throw'); selected = undefined;
    releasePointer(); aimLine.visible = false; hint.hidden = true; moveMode = false;
    canvas.dataset.visitorBall = 'flying'; status.textContent = 'shot away';
  }
  triggers.forEach((button, index) => {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !begin(index)) return;
      event.preventDefault(); event.stopPropagation(); pointerId = event.pointerId; down.set(event.clientX, event.clientY);
      downAt = performance.now(); dragging = false; pull.set(0,0,0);
      if (pointerPoint(event.clientX, event.clientY)) pullStart.copy(point);
      canvas.setPointerCapture(pointerId); canvas.classList.add('holding-basketball');
    }, events);
    button.addEventListener('click', event => { if (event.detail === 0 && begin(index)) hint.querySelector<HTMLButtonElement>('[data-action="shoot"]')!.focus(); }, events);
  });
  canvas.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); drag(event);
  }, { ...events, capture: true });
  canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); drag(event); releasePointer();
    if (!dragging) { keyboardAim(); return; }
    if (gesture === 'move') putDown(); else shoot();
  }, { ...events, capture: true });
  canvas.addEventListener('pointercancel', () => { if (pointerId !== undefined) putDown(); }, events);
  canvas.addEventListener('lostpointercapture', () => { if (pointerId !== undefined) putDown(); }, events);
  hint.querySelector('[data-action="shoot"]')!.addEventListener('click', shoot, events);
  hint.querySelector('[data-action="home"]')!.addEventListener('click', putBack, events);
  hint.querySelector('[data-action="move"]')!.addEventListener('click', () => { moveMode = !moveMode; gesture = moveMode ? 'move' : 'aim'; hint.querySelector('[data-action="move"]')!.setAttribute('aria-pressed', String(moveMode)); aim(); }, events);
  for (const [action, turn] of [['left', -.12], ['right', .12]] as const) hint.querySelector(`[data-action="${action}"]`)!.addEventListener('click', () => { keyboardAngle += turn; keyboardAim(); }, events);
  hint.querySelector('input')!.addEventListener('input', event => { keyboardPower = Number((event.target as HTMLInputElement).value); keyboardAim(); }, events);
  document.addEventListener('keydown', event => { if (selected && event.key === 'Escape') { event.preventDefault(); putDown(); } }, { ...events, capture: true });
  document.addEventListener('pointerdown', event => {
    if (selected && pointerId === undefined && event.target !== canvas && !hint.contains(event.target as Node)
      && !triggers.some(button => button.contains(event.target as Node))) putDown();
  }, events);
  window.addEventListener('blur', () => { if (selected) putDown(); }, events);
  document.addEventListener('visibilitychange', () => { if (document.hidden && selected) putDown(); }, events);

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
        ball.physics.room = ball.ride.target; rooms[roomOf(ball)].add(ball.mesh, ball.shadow);
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
    if (exit?.kind === 'elevator') {
      const target = exit.room;
      ball.ride = { target, elapsed: 0 }; ball.physics.velocity = { x: 0, y: 0, z: 0 };
      if (rooms.current() === room) rooms.visit(target);
      status.textContent = 'the basketball is taking the elevator'; return;
    }
    // The open patio doorway is a continuous threshold between the two rooms.
    if (exit?.kind === 'door') {
      const next = exit.room;
      Object.assign(p, exit.position);
      ball.physics.room = next; ball.portalCooldown = 1;
      rooms[next].add(ball.mesh, ball.shadow); send('hold', ball); send('throw', ball);
      if (rooms.current() === room) rooms.visit(next);
    }
  }
  return {
    get busy() { return locals.has(0) || !!selected; },
    update(dt: number, view: THREE.Camera, visible: boolean) {
      camera = view; available = visible && !document.body.matches('.avatar-editor-open, .inspect-open, .chat-open, .team-open, .brand-open');
      if (!available && selected) putDown();
      for (const ball of locals.values()) {
        pickups[ball.index].visible = false; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = false;
        portal(ball, dt);
        if (ball.flight && !ball.ride && selected !== ball) {
          const result = stepVisitorBall(ball.physics, dt);
          ball.mesh.rotation.x += dt * Math.hypot(ball.physics.velocity.x, ball.physics.velocity.z) / RADIUS;
          if (rooms.current() === roomOf(ball)) {
            if (result.swish) { sounds.swish(); status.textContent = 'swish!'; canvas.dataset.visitorBasket = String(Number(canvas.dataset.visitorBasket ?? 0) + 1); }
            if (result.bounce > .12) sounds.bounce(result.bounce);
          }
          if (Math.hypot(ball.physics.velocity.x, ball.physics.velocity.y, ball.physics.velocity.z) < .025) ball.flight = false;
        }
        ball.mesh.position.copy(ball.physics.position); const floor = visitorBallFloor(ball.physics.position, roomOf(ball));
        ball.shadow.position.set(ball.physics.position.x, floor + .019, ball.physics.position.z);
      }
      pickups.forEach((pickup, index) => {
        const local = locals.get(index), button = triggers[index];
        button.hidden = !available || !!local?.ride || (local ? roomOf(local) !== rooms.current() : rooms.current() !== 'factory' || !canPick(index));
        if (button.hidden) return;
        const host = local ? rooms[roomOf(local)] : parent;
        host.localToWorld(point.copy(local?.mesh.position ?? pickup.position)).project(camera);
        button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05;
        Object.assign(button.style, { left: `${(point.x + 1) * canvas.clientWidth / 2 - 22}px`, top: `${(1 - point.y) * canvas.clientHeight / 2 - 22}px` });
      });
      if (selected && performance.now() - lastSend > 500) send('hold');
      for (const [id, ghost] of ghosts) {
        if (performance.now() - ghost.seen > 8000) { removeGhost(id); continue; }
        if (ghost.physics) { stepVisitorBall(ghost.physics, dt); ghost.mesh.position.copy(ghost.physics.position); }
      }
      canvas.dataset.visitorBall = selected ? gesture === 'move' ? 'moving' : 'aiming' : [...locals.values()].some(ball => ball.flight) ? 'flying' : 'resting';
      canvas.dataset.ghostBalls = String(ghosts.size);
    },
    dispose() {
      releasePointer(); abort.abort(); stopMessages(); stopConnection();
      for (const id of ghosts.keys()) removeGhost(id);
      for (const ball of locals.values()) { disposeBall(ball.mesh); disposeBall(ball.shadow); pickups[ball.index].visible = true; if (pickupShadows[ball.index]) pickupShadows[ball.index].visible = true; }
      aimLine.removeFromParent(); aimGeometry.dispose(); aimMaterial.dispose(); triggers.forEach(button => button.remove()); hint.remove(); status.remove();
    },
  };
}
