import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';

/** A resting handheld, deliberately without a hit target, animation, or game state. */
export function createBeanbagConsole(beanbag: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>) {
  const console = new THREE.Group(); console.name = 'beanbag-nintendo-switch';
  const black = standard('#222936', .7), edge = standard('#111821', .85);
  const blue = standard('#35b7c9', .72), red = standard('#e96659', .72);
  const glass = standard('#111d27', .28), reflection = standard('#273b46', .5);
  propPart(console, [.252, .143, .021], [0, 0, 0], black);
  propPart(console, [.235, .126, .002], [0, 0, .0115], edge);
  propPart(console, [.210, .106, .001], [0, 0, .013], glass);
  // A quiet reflection reads as a powered-off screen; no menu or invitation to play.
  propPart(console, [.113, .002, .0005], [-.030, .047, .0137], reflection);
  propPart(console, [.048, .143, .024], [-.150, 0, 0], blue);
  propPart(console, [.048, .143, .024], [.150, 0, 0], red);
  for (const x of [-.128, .128]) propPart(console, [.003, .133, .025], [x, 0, -.001], edge);
  for (const x of [-.15, .15]) propPart(console, [.035, .005, .014], [x, .072, -.006], edge);
  const stick = (x: number, y: number) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .007, 8), edge);
    stem.rotation.x = Math.PI / 2; stem.position.set(x, y, .015); console.add(stem);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.010, .010, .005, 8), black);
    cap.rotation.x = Math.PI / 2; cap.position.set(x, y, .020); console.add(cap);
  };
  stick(-.15, .027); stick(.15, -.023);
  for (const [cx, cy] of [[-.15, -.026], [.15, .029]]) {
    for (const [dx, dy] of [[-.009, 0], [.009, 0], [0, -.009], [0, .009]]) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .003, 6), edge);
      button.rotation.x = Math.PI / 2; button.position.set(cx + dx, cy + dy, .014); console.add(button);
    }
  }
  propPart(console, [.011, .003, .002], [-.146, .055, .014], edge);
  propPart(console, [.011, .003, .002], [.146, .055, .014], edge);
  propPart(console, [.003, .011, .002], [.146, .055, .014], edge);

  // Fit the device against the actual deformed cushion. A world-height guess
  // either sank the corners into the bag or left the handheld visibly floating.
  const surface = new THREE.Mesh(beanbag.geometry, beanbag.material);
  surface.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(-.04, 2, -.38), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(surface, false)[0];
  const normal = hit?.face?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  console.position.copy(hit?.point ?? new THREE.Vector3(-.04, .9, -.38));
  console.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  console.rotateZ(.18);
  // Sample the rigid back at its corners and centre; the highest contact point
  // supports it so none of its edges pass through the soft seat.
  console.updateMatrixWorld(true);
  let lift = .012;
  for (const x of [-.174, 0, .174]) for (const y of [-.072, 0, .072]) {
    const corner = new THREE.Vector3(x, y, -.012).applyMatrix4(console.matrixWorld);
    ray.set(new THREE.Vector3(corner.x, 2, corner.z), new THREE.Vector3(0, -1, 0));
    const support = ray.intersectObject(surface, false)[0];
    if (support) lift = Math.max(lift, support.point.y - corner.y + .002);
  }
  console.position.y += lift;
  console.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = object.receiveShadow = true; });
  beanbag.add(console);
  return console;
}
