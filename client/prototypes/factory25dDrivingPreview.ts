import { GarageDrivingSimulation, type GarageDriveRequest, type GarageDriveResult, type GarageDriveState, type GarageDrivePedestrian } from '@shared/factory25d-driving';

/** Only the explicitly selected local playground uses a private simulation. */
export function createDrivingPreview(receive: (message: GarageDriveResult | GarageDriveState) => void) {
  const simulation = new GarageDrivingSimulation(), visitorId = 'local-driving-preview';
  let lastSend = -Infinity;
  return {
    send(message: GarageDriveRequest) {
      let success = true, error: string | undefined;
      const car = simulation.car(message.car);
      if (message.action === 'claim') {
        success = simulation.claim(message.car, visitorId);
        if (!success) error = 'That car is already occupied or parking.';
      } else if (car.driverVisitorId !== visitorId) { success = false; error = 'Choose a car first.'; }
      else if (message.action === 'input') { if (message.input) simulation.setInput(message.car, message.input); }
      else if (message.action === 'release') simulation.release(message.car);
      else if (message.action === 'reset') success = simulation.reset(message.car);
      if (message.action !== 'input') receive({ type: 'garage_drive_result', action: message.action, car: message.car, visitorId, success, error });
      receive(simulation.snapshot(Date.now()));
      return true;
    },
    update(dt: number, now: number, pedestrians: GarageDrivePedestrian[]) {
      simulation.step(dt, Date.now(), pedestrians);
      const pushes = simulation.pedestrianPushes.map(push => ({ ...push }));
      if (now - lastSend >= 100) { lastSend = now; receive(simulation.snapshot(Date.now())); }
      return pushes;
    },
    dispose() {},
  };
}
