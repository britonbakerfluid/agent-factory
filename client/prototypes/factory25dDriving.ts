import * as THREE from 'three';
import { GARAGE_WORLD_Z, GARAGE_LEVEL } from '@shared/factory25d-layout';
import { GARAGE_MARK_LIFETIME_MS, GARAGE_MAX_MARKS, type GarageDriveCar, type GarageDriveInput, type GarageDriveRequest, type GarageDriveResult, type GarageDriveState, type GarageTireMark } from '@shared/factory25d-driving';
import { garageRampHeightAt, type GarageCarId } from '@shared/factory25d-garage';
import { isControlPreview, onFactoryConnection, onFactoryMessage, sendGarageDrive } from './factory25dBoardData';
import type { createLiveAgents } from './factory25dLiveAgents';
import { createGarageDriveVisuals } from './factory25dGarageDriveVisuals';
import { GarageDriveInterpolation } from './factory25dDriveInterpolation';
import { createDrivingControls } from './factory25dDrivingControls';

/** Public car controls use the same room, models, clock and avatar renderers. */
export function createGarageDriving(room: THREE.Group, cars: Map<string, THREE.Group>, agents: ReturnType<typeof createLiveAgents>, canvas: HTMLCanvasElement, beforeClaim: () => void) {
  const abort = new AbortController(), poses = new GarageDriveInterpolation(), visuals = createGarageDriveVisuals(room, cars);
  const marks = new Map<number, GarageTireMark>(), seats = new Map<GarageCarId, THREE.Object3D>(), seatPoint = new THREE.Vector3();
  let visitorId: string | undefined, owned: GarageCarId | undefined, parking: GarageCarId | undefined, pending: { car: GarageCarId; at: number } | undefined;
  let preview: ReturnType<typeof import('./factory25dDrivingPreview').createDrivingPreview> | undefined;
  let states: GarageDriveCar[] = [], input: GarageDriveInput = { throttle: 0, steer: 0, drift: false };
  let available = false, disposed = false, lastSend = -Infinity, lastPacket = -Infinity, serverClock = Date.now(), packetClock = performance.now();
  let engine: { car: GarageCarId; throttle: number } | undefined;
  const busy = new Set<string>();
  const controls = createDrivingControls(canvas, {
    input(value) { input = value; if (owned) send({ type: 'garage_drive', action: 'input', car: owned, input }); },
    leave() { if (owned) send({ type: 'garage_drive', action: 'release', car: owned }); },
  });
  function send(message: GarageDriveRequest) { return preview ? preview.send(message) : sendGarageDrive(message); }
  function drop(message: string) { owned = undefined; pending = undefined; input = { throttle: 0, steer: 0, drift: false }; controls.show(undefined); controls.announce(message); }
  function receive(message: GarageDriveState | GarageDriveResult) {
    if (disposed) return;
    if (message.type === 'garage_drive_result') {
      if (message.action === 'input') return;
      if (!message.success) { pending = undefined; controls.announce(message.error ?? 'That car is unavailable right now.'); return; }
      if (message.action === 'claim') {
        visitorId = message.visitorId; owned = message.car; pending = undefined; lastPacket = performance.now();
        if (parking === owned) parking = undefined;
        controls.show(owned); visuals.nudge(owned);
        controls.announce(`${owned === 'delorean' ? 'wheels up' : 'ready to drive'} · WASD or drag to drive · space or a second finger to drift · click this car again or Escape to park`);
      } else { parking = message.action === 'release' ? message.car : undefined; drop(message.action === 'release' ? 'parking back in its bay' : 'back in its bay · repairs take time'); }
      return;
    }
    const now = performance.now(); lastPacket = now; serverClock = message.serverTime; packetClock = now;
    states = message.cars; busy.clear(); for (const car of states) if (car.mode !== 'parked') busy.add(car.id);
    if (parking && states.find(car => car.id === parking)?.mode === 'parked') { parking = undefined; controls.announce(''); }
    poses.push(states, message.serverTime, now);
    if (message.replaceMarks) marks.clear();
    for (const mark of message.marks) marks.set(mark.id, mark);
    for (const [id, mark] of marks) if (message.serverTime - mark.createdAt > GARAGE_MARK_LIFETIME_MS) marks.delete(id);
    while (marks.size > GARAGE_MAX_MARKS) marks.delete(marks.keys().next().value!);
    visuals.replaceMarks([...marks.values()]);
    if (owned) {
      const car = states.find(car => car.id === owned);
      if (!car || car.mode !== 'driving' || car.driverVisitorId !== visitorId) {
        parking = car?.mode === 'returning' && car.driverVisitorId === visitorId ? car.id : undefined;
        drop(parking ? 'parking back in its bay' : 'car controls released');
      }
    }
  }
  const stopMessages = onFactoryMessage(message => { if (message.type === 'garage_drive_state' || message.type === 'garage_drive_result') receive(message); });
  const stopConnection = onFactoryConnection(connected => {
    if (!connected && !isControlPreview()) { poses.clear(); states = []; busy.clear(); parking = undefined; drop('factory disconnected · the car will park itself'); }
  });
  if (import.meta.env.DEV && isControlPreview()) void import('./factory25dDrivingPreview').then(({ createDrivingPreview }) => {
    if (disposed) return;
    preview = createDrivingPreview(receive);
    if (pending) preview.send({ type: 'garage_drive', action: 'claim', car: pending.car });
  });
  window.addEventListener('pagehide', () => { if (owned) send({ type: 'garage_drive', action: 'release', car: owned }); }, { signal: abort.signal });
  return {
    busy, isActive: () => !!owned || !!pending, engine: () => engine,
    claim(car: GarageCarId) {
      if (!available || pending) return;
      if (owned === car) { controls.stop(); visuals.nudge(car); send({ type: 'garage_drive', action: 'release', car }); return; }
      const target = states.find(state => state.id === car);
      if (target && target.mode !== 'parked' && !(target.mode === 'returning' && target.driverVisitorId === visitorId)) {
        controls.announce('someone is using that car · choose another for now'); return;
      }
      if ([...agents.entries.values()].some(entry => entry.session.world.carVisit?.car === car || car === 'mini' && !!entry.session.world.miniWork)) {
        controls.announce('someone is using that car · choose another for now'); return;
      }
      controls.stop(); beforeClaim(); pending = { car, at: performance.now() }; controls.announce(owned ? 'switching cars…' : 'getting the car keys…');
      if (isControlPreview() && !preview) return;
      if (!send({ type: 'garage_drive', action: 'claim', car })) { pending = undefined; controls.announce('driving needs the updated factory connection · use the local playground to try it here'); }
    },
    update(dt: number, now: number, visible: boolean, reduced: boolean) {
      available = visible; controls.visible(visible); controls.enable(visible && !!owned && !pending && !document.hidden);
      if (!visible && owned) send({ type: 'garage_drive', action: 'release', car: owned });
      const pedestrians = [...agents.entries.values()].filter(entry => entry.mesh.userData.room === 'garage')
        .map(entry => ({ x: entry.mesh.position.x, z: entry.mesh.position.z, sessionId: entry.session.sessionId }));
      preview?.update(dt, now, pedestrians);
      if (pending && now - pending.at > 5000) { pending = undefined; controls.announce('no reply to the car switch yet · try again when connected'); }
      if (owned && now - lastPacket > 2500) drop('connection paused · controls released');
      if (owned && visible && !document.hidden && now - lastSend >= 75) { lastSend = now; send({ type: 'garage_drive', action: 'input', car: owned, input }); }
      const rendered = poses.sample(now); engine = undefined;
      for (const state of rendered) {
        const car = cars.get(state.id); if (!car) continue;
        car.visible = !(state.timeJump && !state.timeJump.arrived);
        car.position.set(state.x, .025 + (state.hoverHeight ?? 0), state.z); car.rotation.y = state.yaw;
        for (const shadow of car.children) if (shadow.userData.role === 'ground_shadow') shadow.position.y = shadow.userData.restY + (garageRampHeightAt(state.x, state.z) - (state.hoverHeight ?? 0)) / car.scale.y;
        visuals.poseCar(state);
        if (state.mode !== 'parked' && visible) {
          const throttle = Math.min(1, Math.abs(state.throttle) * .4 + Math.hypot(state.vx, state.vz) / 9);
          if (!engine || state.id === owned) engine = { car: state.id, throttle };
        }
        if (state.driverSessionId && state.mode !== 'parked') {
          let seat = seats.get(state.id);
          if (!seat) { car.traverse(node => { if (node.userData.role === 'driver_socket') seat = node; }); if (seat) seats.set(state.id, seat); }
          if (seat) {
            room.updateWorldMatrix(true, true); seat.getWorldPosition(seatPoint);
            agents.poseGaragePassenger(state.driverSessionId, { x: state.x + seatPoint.x - car.getWorldPosition(new THREE.Vector3()).x, z: seatPoint.z + GARAGE_WORLD_Z },
              seatPoint.y - GARAGE_LEVEL - .018, 1, false, now / 1000, state.mode === 'donut' ? 'taking a little donut break' : state.mode === 'returning' ? 'parking the car' : 'driving');
          }
        }
        if (state.id === owned) {
          controls.condition(state.damage, Math.abs(state.slip) > .09 && Math.hypot(state.vx, state.vz) > 1, state.hoverHeight);
          Object.assign(controls.dock.dataset, { car: state.id, x: state.x.toFixed(3), z: state.z.toFixed(3), yaw: state.yaw.toFixed(3), height: (state.hoverHeight ?? 0).toFixed(3), speed: Math.hypot(state.vx, state.vz).toFixed(2), marks: String(marks.size) });
        }
      }
      visuals.update(dt, { visible, reducedMotion: reduced, now: serverClock + now - packetClock });
    },
    dispose() { if (owned) send({ type: 'garage_drive', action: 'release', car: owned }); disposed = true; abort.abort(); stopMessages(); stopConnection(); controls.dispose(); visuals.dispose(); preview?.dispose(); },
  };
}
