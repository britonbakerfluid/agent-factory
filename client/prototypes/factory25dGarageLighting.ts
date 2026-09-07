import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';

/** The roof and near walls participate in lighting while the camera sees a cutaway. */
export function createGarageLighting(room: THREE.Group) {
  const shell = new THREE.Group(); shell.name = 'garage-enclosed-shell'; room.add(shell);
  const wall = standard('#252941', 1, '#060714'), trim = standard('#414b65', 1, '#080a14');
  const cutaway = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide });
  const solid = (name: string, size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const mesh = propPart(shell, size, position, material); mesh.name = name; return mesh;
  };
  const ceiling = 3.55;
  solid('cutaway-ceiling', [24.2, .18, 21], [0, ceiling + .09, 5.8], cutaway).receiveShadow = false;
  for (const x of [-12, 12]) {
    solid('cutaway-side-wall', [.18, ceiling, 20.8], [x, ceiling / 2, 5.8], cutaway).receiveShadow = false;
    // A small visible return and wall cap make the cut plane legible at each edge.
    solid('side-wall-return', [.2, .85, 20.8], [x, .425, 5.8], wall);
    solid('side-wall-cap', [.24, .055, 20.8], [x, .875, 5.8], trim);
  }
  solid('cutaway-front-wall', [24.2, ceiling, .18], [0, ceiling / 2, 16.25], cutaway).receiveShadow = false;
  // The window openings are real holes in the light-blocking wall, not paintings
  // on a solid wall. The ramp exit has its own lintel at the right-hand end.
  solid('window-sill-wall', [21.55, 1.13, .22], [-1.225, .565, -4.55], wall);
  solid('window-header-wall', [21.55, .96, .22], [-1.225, 3.07, -4.55], wall);
  for (const [left, right] of [[-12, -9], [-3.5, -2.75], [2.75, 3.5], [9, 9.55]]) {
    solid('window-pier', [right - left, 1.46, .22], [(left + right) / 2, 1.86, -4.55], wall);
  }
  solid('ceiling-front-edge', [24.2, .2, .65], [0, 3.51, -4.25], trim);
  solid('ramp-exit-lintel', [2.45, .48, .22], [10.775, 3.31, -4.55], wall);

  const lights = new THREE.Group(); lights.name = 'garage-room-lighting'; room.add(lights);
  const ambient = new THREE.HemisphereLight('#aebed5', '#3d354c', 1.1); lights.add(ambient);
  const windowWash = [-6.25, 0, 6.25].map(x => {
    const light = new THREE.RectAreaLight('#c2dcff', 3, 5.35, 1.3);
    light.name = 'garage-window-wash'; light.position.set(x, 1.86, -4.04); light.lookAt(x, 1.3, 3); lights.add(light); return light;
  });
  const ceilingWash = [1, 10.5].map(z => {
    const light = new THREE.RectAreaLight('#d6dcf0', 20, 19, .16);
    light.name = 'garage-ceiling-wash'; light.position.set(0, ceiling - .12, z); light.rotation.x = -Math.PI / 2; lights.add(light); return light;
  });
  const wallLights: THREE.PointLight[] = [];
  for (const x of [-6.25, 0, 6.25]) {
    const light = new THREE.PointLight('#efc18b', 2.4, 3.8, 2);
    light.position.set(x, 2.8, -3.7); lights.add(light); wallLights.push(light);
  }
  function shadowLight(name: string, color: string, intensity: number) {
    const light = new THREE.DirectionalLight(color, intensity); light.name = name; light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: .1, far: 75 });
    light.shadow.bias = -.00015;
    lights.add(light, light.target); return light;
  }
  const daylight = shadowLight('garage-window-sun', '#e5edfa', .75);
  daylight.target.position.set(0, 0, 5.8);
  const overhead = shadowLight('garage-overhead-form', '#dce4fa', .5);
  // Vertical rays keep the entire ceiling behind this interior shadow camera.
  // Tilting a near-ceiling directional light clips a diagonal slice of the roof.
  overhead.position.set(-3, ceiling - .2, 5.8); overhead.target.position.set(-3, 0, 5.8);
  // A near plane behind the ceiling would let sun through the invisible roof.
  daylight.position.set(-8, 25, -24);
  const ray = new THREE.Vector3();
  let interiorOn = true, nightAmount = 0;
  function updateInteriorLights() {
    for (const light of ceilingWash) light.intensity = interiorOn ? 20 + nightAmount * 8 : 0;
    for (const light of wallLights) light.intensity = interiorOn ? 2.4 : 0;
    overhead.intensity = interiorOn ? .5 + nightAmount * .15 : 0;
  }
  return {
    shell, lights,
    isInteriorOn: () => interiorOn,
    setInteriorOn(on: boolean) { interiorOn = on; updateInteriorLights(); },
    sync(source: { ambient: THREE.HemisphereLight; window: THREE.RectAreaLight; sun: THREE.DirectionalLight }) {
      ambient.color.copy(source.ambient.color); ambient.groundColor.copy(source.ambient.groundColor);
      ambient.intensity = .9 + source.ambient.intensity * .32;
      for (const light of windowWash) { light.color.copy(source.window.color); light.intensity = source.window.intensity * .46; }
      nightAmount = 1 - THREE.MathUtils.clamp(source.ambient.intensity / 3.5, 0, 1);
      updateInteriorLights();
      daylight.color.copy(source.sun.color); daylight.intensity = source.sun.intensity * .9;
      daylight.castShadow = source.sun.castShadow;
      ray.subVectors(source.sun.position, source.sun.target.position).normalize().multiplyScalar(45);
      daylight.position.copy(daylight.target.position).add(ray);
    },
    dispose() {
      shell.removeFromParent(); lights.removeFromParent();
      shell.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
      wall.dispose(); trim.dispose(); cutaway.dispose();
      daylight.shadow.map?.dispose(); overhead.shadow.map?.dispose();
    },
  };
}
