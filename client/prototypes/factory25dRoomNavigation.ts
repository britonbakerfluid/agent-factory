import type { FactoryRoom } from '@shared/factory25d-layout';

type RoomPort = { visit(open: boolean): void; isActive(): boolean };

/** Finish leaving one room before asking the next room to open. */
export function createRoomNavigation(
  garage: RoomPort & { isTransitioning(): boolean },
  patio: RoomPort & { showsFactory(): boolean },
) {
  let destination: FactoryRoom | undefined;
  return {
    destination: () => destination,
    request(room: FactoryRoom) { destination = room; },
    update(available = true) {
      if (!destination || !available) return;
      if (garage.isTransitioning()) { garage.visit(destination === 'garage'); return; }
      if (garage.isActive()) {
        if (destination === 'garage') destination = undefined;
        else garage.visit(false);
        return;
      }
      if (patio.isActive()) {
        patio.visit(destination === 'patio');
        if (destination === 'patio' && !patio.showsFactory()) destination = undefined;
        return;
      }
      if (destination === 'garage') garage.visit(true);
      else if (destination === 'patio') patio.visit(true);
      else destination = undefined;
    },
  };
}
