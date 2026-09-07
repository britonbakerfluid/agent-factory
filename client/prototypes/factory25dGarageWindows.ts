import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';

/** A continuous crop of the live upstairs panorama, behind shallow window reveals. */
export function createGarageWindows(
  room: THREE.Object3D,
  windowMaterial: THREE.Material,
  skyMaterial?: THREE.Material,
  sourceHeight = 3.598,
  cloudMaterial?: THREE.Material,
) {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) throw new RangeError('Window source height must be positive');
  const group = new THREE.Group(); group.name = 'garage-windows'; room.add(group);
  const width = 5.5, height = 1.46, sourceWidth = 15.84, panoramaWidth = 18;
  // Cover the whole wall with one uniformly scaled image. A crop around the
  // horizon retains sky, ridges and trees without squashing the panorama.
  const magnification = Math.max(panoramaWidth / sourceWidth, height / sourceHeight);
  const verticalSpan = height / (sourceHeight * magnification);
  const cropTop = Math.max(.82, verticalSpan);
  const backing = standard('#171d31'), reveal = standard('#414b65');
  // Material.clone retains the live render-target/canvas maps by reference.
  // Each pane shares these owned clones; their source textures are never owned here.
  const terrain = windowMaterial.clone();
  const sky = skyMaterial?.clone() ?? new THREE.MeshBasicMaterial({ color: '#455572' });
  const clouds = cloudMaterial?.clone();
  const materials = new Set<THREE.Material>([backing, reveal, terrain, sky]);
  if (clouds) materials.add(clouds);
  const geometries = new Set<THREE.BufferGeometry>();
  function part(pane: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material, name: string) {
    const mesh = propPart(pane, size, position, material); mesh.name = name;
    geometries.add(mesh.geometry); return mesh;
  }
  for (const [index, x] of [-6.25, 0, 6.25].entries()) {
    const pane = new THREE.Group(); pane.name = `garage-window-${index}`; pane.position.set(x, 1.86, 0); group.add(pane);
    // Backing front −4.39 < sky −4.35 < terrain −4.33 < reveal front −4.29.
    // Positive separation remains even when viewed obliquely from the room.
    // This is scenery outside the opening, not an opaque sun-blocking wall.
    part(pane, [width + .18, height + .18, .10], [0, 0, -4.44], backing, 'window-backing').castShadow = false;
    const geometry = new THREE.PlaneGeometry(width, height), uv = geometry.getAttribute('uv');
    for (let vertex = 0; vertex < uv.count; vertex++) {
      const worldX = x - width / 2 + uv.getX(vertex) * width;
      uv.setXY(vertex, .5 + worldX / (sourceWidth * magnification), cropTop - (1 - uv.getY(vertex)) * verticalSpan);
    }
    geometries.add(geometry);
    for (const [name, material, z] of [['window-sky', sky, -4.35], ['window-terrain', terrain, -4.33]] as const) {
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.z = z; pane.add(mesh);
    }
    if (clouds) {
      const mesh = new THREE.Mesh(geometry, clouds); mesh.name = 'window-clouds'; mesh.position.z = -4.34; pane.add(mesh);
    }
    for (const side of [-1, 1]) {
      part(pane, [.07, height, .10], [side * (width / 2 + .035), 0, -4.34], reveal, 'window-jamb');
      part(pane, [width + .14, .07, .10], [0, side * (height / 2 + .035), -4.34], reveal, 'window-lintel');
    }
  }
  let disposed = false;
  return { group, dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  } };
}
