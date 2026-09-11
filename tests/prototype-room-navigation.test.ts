import { describe, expect, it, vi } from 'vitest';
import { createRoomNavigation } from '../client/prototypes/factory25dRoomNavigation';

function setup() {
  const state = { garage: false, elevator: false, patio: false, patioMoving: false };
  const garage = {
    isActive: () => state.garage,
    isTransitioning: () => state.elevator,
    visit: vi.fn((open: boolean) => { if (open !== state.garage) state.elevator = true; }),
  };
  const patio = {
    isActive: () => state.patio || state.patioMoving,
    showsFactory: () => !state.patio || state.patioMoving,
    visit: vi.fn((open: boolean) => { state.patioMoving = true; state.patio = open; }),
  };
  return { state, garage, patio, navigation: createRoomNavigation(garage, patio) };
}

describe('navigation between factory rooms', () => {
  it('waits for the elevator before opening the patio', () => {
    const { state, garage, patio, navigation } = setup();
    state.garage = true;
    navigation.request('patio'); navigation.update();
    expect(garage.visit).toHaveBeenCalledWith(false);
    navigation.update();
    expect(patio.visit).not.toHaveBeenCalled();
    state.garage = false; state.elevator = false;
    navigation.update();
    expect(patio.visit).toHaveBeenCalledWith(true);
  });

  it('waits for the patio return before boarding the elevator', () => {
    const { state, garage, patio, navigation } = setup();
    state.patio = true;
    navigation.request('garage'); navigation.update();
    expect(patio.visit).toHaveBeenCalledWith(false);
    navigation.update();
    expect(garage.visit).not.toHaveBeenCalled();
    state.patioMoving = false;
    navigation.update();
    expect(garage.visit).toHaveBeenCalledWith(true);
  });

  it('honors a new upstairs destination during travel and waits out an unavailable view', () => {
    const { state, garage, patio, navigation } = setup();
    state.garage = true; state.elevator = true;
    navigation.request('patio'); navigation.update();
    navigation.request('factory'); navigation.update();
    expect(garage.visit).toHaveBeenLastCalledWith(false);
    garage.visit.mockClear();
    state.elevator = false;
    navigation.update(false);
    expect(garage.visit).not.toHaveBeenCalled();
    navigation.update();
    expect(garage.visit).toHaveBeenCalledWith(false);
    state.garage = false; state.elevator = false;
    navigation.update(); navigation.update();
    expect(patio.visit).not.toHaveBeenCalled();
  });
});
