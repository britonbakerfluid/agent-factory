import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propPart, standard } from './factory25dProps';
import { signTexture } from './factory25dLabels';

export const CONSOLE_CANDIDATES = [
  { name: 'Candy', color: '#78c7b4' },
  { name: 'Vector', color: '#b4d47d' },
  { name: 'Orbit', color: '#c7a4ea' },
  { name: 'Stereo', color: '#eda367' },
  { name: 'Twin', color: '#78bde4' },
  { name: 'Skee-ball', color: '#d7985d' },
  { name: 'Pinball', color: '#e6b658' },
  { name: 'Claw', color: '#df93a3' },
  { name: 'Rhythm', color: '#8abed0' },
  { name: 'Rally', color: '#de7970' },
  { name: 'Terminal', color: '#92b894' },
] as const;

/** Different arcade silhouettes share the agent's standing reach and live feedback materials. */
export function createConsoleCandidate(root: THREE.Group, index: number,
  screenMaterial: THREE.MeshStandardMaterial, accent: THREE.MeshStandardMaterial) {
  const candidate = CONSOLE_CANDIDATES[index];
  root.name = `console-candidate-${index + 1}-${candidate.name.toLowerCase()}`;
  root.userData.consoleCandidate = candidate.name;
  const owned = new Set<THREE.Material>(), textures: THREE.Texture[] = [];
  const mat = (color: string, roughness = .72) => {
    const material = standard(color, roughness); owned.add(material); return material;
  };
  const dark = mat('#161e2a'), cream = mat('#dbddcb'), black = mat('#252c36');
  const color = mat(candidate.color), buttonRed = mat('#da797f');
  const part = (size: [number, number, number], at: [number, number, number], material: THREE.Material) =>
    propPart(root, size, at, material);
  const panel = (w: number, h: number, x: number, y: number, z: number, tilt = 0) => {
    const frame = part([w + .1, h + .1, .075], [x, y, z], dark); frame.rotation.x = tilt;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial);
    screen.position.set(x, y - Math.sin(tilt) * .04, z + Math.cos(tilt) * .04);
    screen.rotation.x = tilt; root.add(screen);
  };
  const disc = (radius: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, 12), material);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const ring = (radius: number, tube: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 4, 12), material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const ball = (radius: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius), material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const ticketSlot = (x: number, y: number, z: number) => {
    part([.23, .07, .025], [x, y, z], dark);
    part([.18, .014, .015], [x, y, z + .014], cream);
  };
  const controls = (material: THREE.Material, width = .9) => {
    const deck = part([width, .075, .29], [0, .575, .245], material); deck.rotation.x = .12;
    part([.027, .09, .027], [-.22, .655, .28], dark);
    const stick = new THREE.Mesh(new THREE.IcosahedronGeometry(.041), buttonRed);
    stick.position.set(-.22, .711, .28); root.add(stick);
    for (const [i, x] of [.09, .22, .35].entries()) {
      const key = new THREE.Mesh(new THREE.CylinderGeometry(.031, .033, .021, 8), i === 0 ? buttonRed : color);
      key.position.set(x, .637, .29); root.add(key);
    }
  };
  part([.83, .08, .51], [0, .05, .005], dark);
  for (const x of [-.32, .32]) part([.10, .035, .12], [x, .0175, .15], black);

  if (index === 0) {
    // Candy: squat cream body, broad mint shoulders and a deeply recessed CRT.
    part([.78, .46, .45], [0, .31, -.01], cream);
    part([.91, .49, .36], [0, .85, -.035], cream);
    for (const side of [-1, 1]) {
      part([.10, .56, .40], [side * .455, .845, -.015], color);
      const cheek = part([.10, .17, .48], [side * .45, .57, .04], color); cheek.rotation.x = -.22;
    }
    part([.86, .075, .39], [0, 1.105, -.02], cream);
    panel(.67, .35, 0, .86, .18, -.08);
    part([.61, .026, .03], [0, 1.085, .20], accent);
    for (let i = 0; i < 5; i++) part([.20, .011, .012], [-.19, .27 + i * .027, .222], black);
    controls(cream, 1.0);
  } else if (index === 1) {
    // Vector: a tapered pedestal and tall, raked screen under an angular brow.
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.31, .40, .46, 4), black);
    pedestal.rotation.y = Math.PI / 4; pedestal.position.set(0, .32, 0); root.add(pedestal);
    const housing = part([.78, .55, .29], [0, .89, -.075], black); housing.rotation.x = -.16;
    for (const side of [-1, 1]) {
      const fin = part([.10, .69, .29], [side * .44, .84, -.035], dark); fin.rotation.x = -.19;
      const stripe = part([.022, .57, .018], [side * .448, .86, .14], accent); stripe.rotation.x = -.19;
    }
    panel(.65, .38, 0, .91, .095, -.16);
    const brow = part([.94, .08, .42], [0, 1.185, -.07], black); brow.rotation.x = -.12;
    part([.55, .023, .02], [0, 1.18, .152], accent);
    controls(black);
  } else if (index === 2) {
    // Orbit: a faceted circular monitor above a narrow trunk and broad control deck.
    part([.48, .43, .37], [0, .315, -.025], cream);
    part([.56, .11, .42], [0, .13, -.005], color);
    disc(.43, .26, 0, .88, -.005, color);
    disc(.37, .018, 0, .88, .135, cream);
    panel(.58, .31, 0, .875, .154);
    for (const side of [-1, 1]) part([.035, .045, .017], [side * .36, .88, .15], accent);
    part([.21, .023, .022], [0, 1.255, .145], accent);
    controls(cream, .94);
  } else if (index === 3) {
    // Stereo: warm wood cheeks, a split speaker grille, and an amber marquee.
    const walnut = mat('#765044'), grain = mat('#946650');
    part([.76, .98, .40], [0, .605, -.015], black);
    for (const side of [-1, 1]) {
      part([.11, 1.10, .48], [side * .44, .60, -.025], walnut);
      for (const y of [.20, .34, .76, 1.03]) part([.015, .013, .31], [side * .501, y, -.02], grain);
    }
    panel(.65, .33, 0, .87, .20);
    part([.76, .08, .035], [0, 1.13, .225], accent);
    for (const x of [-.20, .20]) {
      disc(.12, .016, x, .31, .205, dark);
      for (let i = 0; i < 5; i++) part([.185, .008, .009], [x, .255 + i * .028, .222], grain);
    }
    controls(walnut);
  } else if (index === 4) {
    // Twin: two separately framed displays and an open steel chassis.
    const blue = mat('#344f71');
    for (const x of [-.36, .36]) part([.075, 1.10, .11], [x, .62, -.10], blue);
    part([.71, .19, .37], [0, .27, -.02], blue);
    part([.81, .52, .24], [0, .90, -.04], dark);
    panel(.65, .26, 0, 1.015, .102, -.08);
    panel(.65, .14, 0, .735, .12, -.19);
    part([.88, .06, .32], [0, 1.21, -.015], blue);
    part([.72, .019, .025], [0, 1.208, .16], accent);
    for (const side of [-1, 1]) part([.032, .27, .02], [side * .36, .31, .18], color);
    controls(blue, .97);
  } else if (index === 5) {
    // Skee-ball: a short rising lane, ring targets, side fences and ball-return tray.
    const wood = mat('#ab805c');
    part([.74, .41, .58], [0, .315, .025], color);
    const lane = part([.66, .055, .73], [0, .67, -.015], wood); lane.rotation.x = .40;
    for (const side of [-1, 1]) {
      const rail = part([.075, .12, .77], [side * .37, .71, -.015], cream); rail.rotation.x = .40;
      part([.055, .39, .035], [side * .385, 1.0, -.325], cream);
    }
    part([.79, .37, .06], [0, 1.025, -.31], color);
    for (const [x, y, radius] of [[0, .985, .115], [-.245, 1.13, .06], [.245, 1.13, .06]]) {
      disc(radius, .015, x, y, -.272, dark);
      ring(radius, .015, x, y, -.255, cream);
    }
    ring(.075, .011, 0, .985, -.237, cream);
    panel(.28, .085, 0, 1.235, -.28);
    part([.72, .025, .035], [0, .89, -.23], accent);
    part([.79, .075, .19], [0, .575, .30], cream);
    part([.48, .018, .13], [0, .62, .30], dark);
    for (const x of [-.13, 0, .13]) ball(.05, x, .661, .30, wood);
    ticketSlot(0, .265, .326);
  } else if (index === 6) {
    // Pinball: a sloped playfield with bumpers, flippers and an upright score box.
    part([.77, .37, .54], [0, .30, .01], dark);
    for (const side of [-1, 1]) {
      const sidewall = part([.075, .15, .75], [side * .405, .69, .005], color); sidewall.rotation.x = .31;
    }
    const playfield = part([.72, .035, .71], [0, .685, .005], black); playfield.rotation.x = .31;
    for (const [x, z] of [[-.17, -.10], [.17, -.10], [0, .085]]) {
      const y = .72 - Math.sin(.31) * z;
      const bumper = disc(.067, .028, x, y, z, color); bumper.rotation.x = .31;
      const light = disc(.043, .011, x, y + .021, z, accent); light.rotation.x = .31;
    }
    for (const side of [-1, 1]) {
      const flipper = part([.15, .02, .038], [side * .105, .645, .245], cream); flipper.rotation.y = side * -.34;
      const button = disc(.025, .025, side * .443, .60, .28, buttonRed); button.rotation.set(0, 0, Math.PI / 2);
    }
    ball(.027, .22, .687, .18, cream);
    part([.79, .32, .12], [0, 1.02, -.29], color);
    panel(.60, .18, 0, 1.04, -.216);
    part([.62, .023, .017], [0, 1.164, -.22], accent);
    part([.85, .08, .17], [0, .575, .325], color);
    ticketSlot(0, .265, .297);
  } else if (index === 7) {
    // Claw: an airy prize cage with a hanging three-finger grabber and tiny plush prizes.
    part([.77, .47, .48], [0, .345, -.015], color);
    part([.85, .075, .48], [0, 1.185, -.02], color);
    part([.77, .53, .025], [0, .883, -.25], dark);
    const glass = new THREE.MeshStandardMaterial({ color: '#bbecdc', transparent: true, opacity: .10,
      roughness: .22, metalness: .05, depthWrite: false }); owned.add(glass);
    for (const side of [-1, 1]) {
      part([.025, .54, .43], [side * .377, .883, -.02], glass);
      for (const z of [-.235, .207]) part([.045, .55, .045], [side * .399, .883, z], cream);
    }
    part([.72, .51, .012], [0, .893, .217], glass);
    part([.65, .024, .04], [0, 1.142, .16], accent);
    part([.55, .025, .05], [0, 1.133, -.03], black);
    part([.015, .14, .015], [.07, 1.06, -.03], cream);
    ball(.033, .07, .974, -.03, black);
    for (const angle of [0, 2.094, 4.189]) {
      const finger = part([.017, .10, .017], [.07 + Math.cos(angle) * .037, .932, -.03 + Math.sin(angle) * .037], cream);
      finger.rotation.set(Math.cos(angle) * .5, 0, Math.sin(angle) * -.5);
    }
    for (const [x, z, material] of [[-.21, .07, cream], [.03, .10, buttonRed], [.23, -.08, color]] as const) {
      ball(.071, x, .705, z, material); ball(.048, x, .798, z, material);
      for (const side of [-1, 1]) ball(.024, x + side * .036, .837, z, material);
      for (const side of [-1, 1]) part([.011, .012, .007], [x + side * .021, .805, z + .044], dark);
    }
    panel(.27, .09, -.17, .485, .26);
    ticketSlot(.20, .29, .244);
    controls(cream, .88);
  } else if (index === 8) {
    // Rhythm: a bright arrow marquee, round speakers and a compact illuminated step pad.
    const purple = mat('#615684');
    part([.50, .41, .35], [0, .32, -.04], purple);
    part([.62, .66, .27], [0, .88, -.07], purple);
    panel(.43, .39, 0, .88, .08);
    for (const side of [-1, 1]) {
      part([.16, .61, .25], [side * .405, .89, -.05], cream);
      for (const y of [.74, 1.025]) {
        disc(.072, .025, side * .405, y, .09, dark);
        disc(.043, .028, side * .405, y, .106, accent);
      }
    }
    part([.91, .09, .33], [0, 1.25, -.015], color);
    for (const x of [-.24, 0, .24]) {
      const arrow = part([.07, .07, .022], [x, 1.252, .165], accent); arrow.rotation.z = Math.PI / 4;
    }
    part([.82, .045, .30], [0, .101, .26], black);
    for (const x of [-.205, .205]) part([.20, .012, .20], [x, .132, .265], accent);
    controls(purple, .88);
    ticketSlot(0, .265, .151);
  } else if (index === 9) {
    // Rally: a broad windshield display, hood vents and a proper three-spoke wheel.
    part([.64, .45, .40], [0, .33, -.02], color);
    part([.89, .49, .30], [0, .925, -.06], dark);
    for (const side of [-1, 1]) {
      const fender = part([.075, .57, .38], [side * .46, .83, -.02], color); fender.rotation.x = -.13;
    }
    panel(.73, .32, 0, .955, .109, -.08);
    part([.90, .065, .35], [0, 1.20, -.02], color);
    part([.54, .024, .02], [0, 1.201, .168], accent);
    const dash = part([.87, .09, .26], [0, .575, .245], black); dash.rotation.x = .12;
    const wheel = ring(.125, .023, -.11, .697, .313, dark); wheel.rotation.x = -.30;
    disc(.033, .028, -.11, .697, .324, cream);
    for (const angle of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) {
      const spoke = part([.095, .022, .025], [-.11 + Math.cos(angle) * .062, .697 + Math.sin(angle) * .062, .316], cream);
      spoke.rotation.z = angle;
    }
    part([.025, .105, .025], [.25, .645, .27], cream);
    ball(.041, .25, .711, .27, buttonRed);
    for (const x of [-.18, 0, .18]) part([.07, .10, .014], [x, .31, .187], dark);
    ticketSlot(0, .435, .197);
  } else {
    // Terminal: a beige desktop CRT, separate keyboard and a chunky floppy-drive tower.
    const beige = mat('#b9b39b');
    for (const side of [-1, 1]) part([.065, .48, .065], [side * .395, .34, .02], black);
    part([.95, .075, .56], [0, .575, .08], beige);
    part([.68, .18, .32], [0, .445, .085], beige);
    part([.21, .08, .20], [-.13, .65, -.06], cream);
    part([.59, .43, .39], [-.13, .905, -.045], cream);
    part([.55, .045, .35], [-.13, 1.13, -.05], beige);
    panel(.43, .28, -.13, .916, .161);
    part([.025, .018, .017], [.085, .733, .176], accent);
    for (const x of [-.30, -.255, -.21, -.165]) part([.017, .015, .14], [x, 1.157, -.07], dark);
    part([.17, .42, .35], [.34, .824, -.045], beige);
    part([.125, .065, .018], [.34, .922, .136], dark);
    part([.064, .011, .012], [.34, .922, .151], cream);
    part([.024, .02, .019], [.374, .74, .138], accent);
    const keyboard = part([.56, .03, .18], [-.12, .633, .267], cream); keyboard.rotation.x = .07;
    for (const row of [0, 1, 2]) for (let column = 0; column < 8; column++) {
      part([.045, .011, .025], [-.34 + column * .06, .656, .21 + row * .046], beige);
    }
    part([.17, .012, .023], [-.12, .656, .35], beige);
    const mouse = ball(.046, .30, .641, .28, cream); mouse.scale.set(.8, .4, 1.1);
    ticketSlot(.23, .49, .257);
  }

  // Small physical specimen numbers let the user refer to a particular cabinet.
  const texture = signTexture(String(index + 1).padStart(2, '0'), candidate.color, '#17202c', 2, 2.5);
  textures.push(texture);
  const label = new THREE.MeshBasicMaterial({ map: texture }); owned.add(label);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(.18, .072), label);
  badge.position.set(0, .425, .251); root.add(badge);

  // Static parts share a draw call per material; live feedback still updates the original materials.
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...root.children]) if (child instanceof THREE.Mesh) {
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    const bucket = buckets.get(child.material) ?? []; bucket.push(geometry); buckets.set(child.material, bucket);
    child.geometry.dispose(); child.removeFromParent();
  }
  for (const [material, geometries] of buckets) {
    // Primitive types differ in indexing; normalize before merging.
    const flat = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
    const geometry = mergeGeometries(flat, false)!;
    for (const item of new Set([...geometries, ...flat])) item.dispose();
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  return { idleColor: candidate.color, dispose() {
    root.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    owned.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
  } };
}
