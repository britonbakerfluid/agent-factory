import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { stationTicketMount } from '../client/prototypes/factory25dStationTickets';
import { createPatioStations } from '../client/prototypes/factory25dPatioStations';
import { createConsoleCandidate, CONSOLE_CANDIDATES } from '../client/prototypes/factory25dConsoleCandidates';
import { furnishGarage } from '../client/prototypes/factory25dGarageFurnishings';
import { GARAGE_LEVEL, INDOOR_STATIONS, PATIO_STATIONS, GARAGE_STATIONS, MINI_WORKSTATION_ID } from '../shared/factory25d-layout';

vi.mock('../client/prototypes/factory25dContactShadows', () => ({ contactShadow: () => new THREE.Mesh() }));
vi.mock('../client/prototypes/factory25dPlants', () => ({ createIndoorPlants: () => ({ shelf() {}, plant() {}, update() {} }) }));
vi.mock('../client/prototypes/factory25dLabels', () => ({ signTexture: () => new THREE.Texture() }));
afterEach(() => vi.unstubAllGlobals());

it('rests patio and garage window printers on the actual modeled tabletops', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) });
  const patio = new THREE.Group(), garage = new THREE.Group(); garage.position.y = GARAGE_LEVEL;
  createPatioStations(patio); const furnishings = furnishGarage(garage);
  for (const [root, stations] of [[patio, PATIO_STATIONS], [garage, GARAGE_STATIONS.filter(s => /garage-[2-5]/.test(s.id))]] as const) {
    root.updateMatrixWorld(true);
    for (const station of stations) {
      const mount = stationTicketMount(station), bottom = mount.outlet.y - .055 / 2;
      for (const dx of [-.08, .08]) for (const dz of [-.04, .04]) {
        const origin = new THREE.Vector3(mount.outlet.x + dx, bottom + .02, mount.outlet.z - .052 + dz);
        const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, .1).intersectObject(root, true)[0];
        expect(hit, station.id).toBeDefined(); expect(hit.point.y, station.id).toBeCloseTo(bottom, 5);
      }
    }
  }
  furnishings.dispose();
});

it.each(CONSOLE_CANDIDATES.map((spec, index) => ({ ...spec, index })))('$name outlet touches the modeled cabinet instead of floating ahead of it', ({ index }) => {
  const station = INDOOR_STATIONS[index >= 5 ? index - 5 : index + 7];
  const root = new THREE.Group(), screen = new THREE.MeshStandardMaterial(), accent = new THREE.MeshStandardMaterial();
  const model = createConsoleCandidate(root, index, screen, accent);
  root.scale.setScalar(.66); root.position.set(station.x, 0, station.z); root.updateMatrixWorld(true);
  const mount = stationTicketMount(station), origin = mount.outlet.clone().add(new THREE.Vector3(0, 0, .025));
  const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1), 0, .07).intersectObject(root, true)[0];
  expect(hit).toBeDefined(); expect(Math.abs(hit.point.z - mount.outlet.z)).toBeLessThan(.015);
  expect(mount.hardware).toBe(index < 5 || index === 9);
  model.dispose(); screen.dispose(); accent.dispose();
});

it('keeps the portable Mini workstation free of permanent printer hardware', () => {
  const mini = GARAGE_STATIONS.find(station => station.id === MINI_WORKSTATION_ID)!;
  const mount = stationTicketMount(mini);
  expect(mount.hardware).toBe(false);
  expect(mount.outlet.distanceTo(mount.hand)).toBeLessThan(.15);
});
