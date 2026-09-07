import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';
import { createIndoorPlants } from './factory25dPlants';
import type { SceneLightSwitch } from './factory25dLightSwitches';

/** The garage uses the factory's solid props, foliage and contact shadows. */
export function furnishGarage(room: THREE.Group) {
  const lightSwitches: SceneLightSwitch[] = [];
  const navy = standard('#22263d'), edge = standard('#414961'), metal = standard('#697885');
  const dark = standard('#121827'), wood = standard('#a77b4c'), red = standard('#9d304b');
  const warm = standard('#eed3a0', .8, '#e8b573'); warm.emissiveIntensity = .8;
  const wallFixtures = new THREE.Group(); room.add(wallFixtures);
  const wallGlow = warm.clone();
  const switchMaterials = [wallGlow];
  let zone = room;
  const box = (s: [number, number, number], p: [number, number, number], m: THREE.Material, g: THREE.Object3D = zone) => propPart(g, s, p, m);
  const shadow = (x: number, z: number, width: number, depth: number, floorY = 0) => contactShadow(zone, { x, z, width, depth, floorY, opacity: .32, spread: .22 });
  const cylinder = (radius: number, height: number, p: [number, number, number], mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 12), mat);
    mesh.position.set(...p); mesh.castShadow = mesh.receiveShadow = true; zone.add(mesh); return mesh;
  };
  function lamp(x: number, y: number, z: number, width = .8) {
    const fixture = new THREE.Group(); zone.add(fixture);
    const bulb = warm.clone();
    switchMaterials.push(bulb);
    box([width + .12, .075, .18], [x, y, z], dark, fixture);
    box([width, .025, .12], [x, y - .046, z + .035], bulb, fixture);
    const light = new THREE.PointLight('#ffc57a', 2.7, 3, 2);
    light.position.set(x, y - .12, z + .2); fixture.add(light);
    let on = true;
    lightSwitches.push({ id: 'garage-workbench-light', label: 'Garage workbench light', kind: 'light', target: fixture,
      isOn: () => on, setOn(enabled) { on = enabled; light.intensity = on ? 2.7 : 0; bulb.emissiveIntensity = on ? .8 : 0; bulb.color.set(on ? '#eed3a0' : '#736c60'); } });
  }
  function mug(x: number, y: number, z: number) {
    cylinder(.055, .1, [x, y + .05, z], standard('#dfd9c1'));
    cylinder(.039, .003, [x, y + .102, z], standard('#493121'));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.028, .009, 4, 8), standard('#dfd9c1'));
    handle.position.set(x + .06, y + .05, z); zone.add(handle);
  }
  // A solid fascia and columns give the long window wall the reference's depth.
  box([24, .23, .45], [0, 3.42, -4.34], navy);
  for (const x of [-8.95, -3.13, 3.13, 8.95]) {
    box([.35, 3.2, .34], [x, 1.6, -4.15], edge);
    box([.45, .15, .45], [x, .075, -4.13], navy);
    box([.15, .11, .2], [x, 2.25, -3.94], dark, wallFixtures);
    box([.11, .025, .15], [x, 2.18, -3.93], wallGlow, wallFixtures);
  }
  const frontRow = new THREE.Group(); frontRow.position.set(-2.85,0,3.05); room.add(frontRow); zone = frontRow;
  // Tool wall behind the worktop, so its front and drawers remain visible.
  box([3.35, .66, .75], [-5.25, .33, 9.25], navy);
  box([3.55, .12, .93], [-5.25, .74, 9.25], wood);
  box([3.35, 1.05, .1], [-5.25, 1.29, 8.89], standard('#796248'));
  const pegCanvas = document.createElement('canvas'); pegCanvas.width = 512; pegCanvas.height = 160;
  const pegContext = pegCanvas.getContext('2d')!; pegContext.fillStyle = '#796248'; pegContext.fillRect(0,0,512,160); pegContext.fillStyle = '#332e2d';
  for (let i=0;i<22;i++) for(let j=0;j<6;j++) pegContext.fillRect(13+i*23,12+j*25,2,2);
  const pegTexture = new THREE.CanvasTexture(pegCanvas); pegTexture.colorSpace = THREE.SRGBColorSpace; pegTexture.magFilter = THREE.NearestFilter;
  const pegFace = new THREE.Mesh(new THREE.PlaneGeometry(3.22,.94), new THREE.MeshStandardMaterial({map:pegTexture,roughness:1})); pegFace.position.set(-5.25,1.29,8.947); zone.add(pegFace);
  for (let i = 0; i < 10; i++) {
    const x = -6.57 + i * .29, h = .26 + (i % 3) * .04;
    box([.045, h, .055], [x, 1.34, 8.985], i % 3 ? metal : red);
    box([.12, .065, .06], [x, 1.34 + h / 2, 8.985], i % 3 ? metal : dark);
  }
  for (const x of [-6.35, -5.24, -4.14]) {
    box([1.02, .48, .027], [x, .36, 9.64], edge);
    box([.33, .03, .04], [x, .52, 9.675], metal);
  }
  lamp(-5.25, 1.91, 9.03, 1.9); shadow(-5.25, 9.25, 3.45, .9);
  box([.45, .04, .3], [-4.27, .82, 9.31], dark);
  const laptop = box([.45, .28, .028], [-4.27, .98, 9.16], dark); laptop.rotation.x = -.15;
  box([.38, .2, .012], [-4.27, .99, 9.19], standard('#247b61', 1, '#104734'));
  mug(-3.82, .81, 9.34);
  cylinder(.065, .18, [-6.65, .9, 9.3], standard('#7793b1'));
  function chest(x: number, z: number, width = .78) {
    box([width, .78, .65], [x, .48, z], red);
    box([width + .06, .07, .71], [x, .9, z], standard('#bd4056'));
    for (let i = 0; i < 5; i++) { box([width - .1, .011, .015], [x, .23 + i * .12, z + .335], dark); box([width - .2, .022, .03], [x, .28 + i * .12, z + .35], metal); }
    for (const side of [-1, 1]) cylinder(.08, .07, [x + side * (width / 2 - .08), .1, z + .2], dark).rotation.z = Math.PI / 2;
    shadow(x, z, width, .65);
  }
  chest(-7.95, 9.3,1.0);
  cylinder(.19,.07,[-5.75,.45,10.2],red); cylinder(.035,.33,[-5.75,.25,10.2],metal);
  for(const angle of [0,Math.PI/3,Math.PI*2/3]) { const leg=box([.48,.035,.045],[-5.75,.08,10.2],dark); leg.rotation.y=angle; }
  shadow(-5.75,10.2,.48,.48);
  // Tires have an open center and an inner rim instead of a solid cylinder.
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(.23, .085, 6, 16), dark);
    tire.position.set(-8.03 + (i % 2) * .42, 1.22 + Math.floor(i / 2) * .47, 8.91); tire.castShadow = true; zone.add(tire);
  }
  box([1.05, .055, .45], [-7.82, 1.02, 8.9], edge);
  const frontStations = new THREE.Group(); frontStations.position.z=3.05; room.add(frontStations); zone=frontStations;
  // Two compact workstations borrow the upstairs cabinet proportions and palette.
  const workScreens: THREE.MeshStandardMaterial[] = [];
  for (const [x, accent] of [[-3.8, '#4cb5c3'], [-1.8, '#b743be']] as const) {
    const body = new THREE.Group(); body.position.set(x, 0, 9.25); zone.add(body);
    const part = (s: [number, number, number], p: [number, number, number], m: THREE.Material) => box(s, p, m, body);
    part([.78, .12, .95], [0, .07, .22], dark);
    part([.69, .75, .42], [0, .48, -.04], navy);
    for (const side of [-1, 1]) part([.07, .94, .53], [side * .38, .52, -.04], edge);
    part([.86, .1, .58], [0, 1.03, -.03], edge);
    const marquee = standard(accent, 1, accent); marquee.emissiveIntensity = .35; part([.7, .055, .02], [0, 1.035, .27], marquee);
    part([.66, .42, .06], [0, .75, .2], dark);
    const material = standard('#347d77', .65, '#195b53'); material.emissiveIntensity = .7; workScreens.push(material);
    part([.55, .3, .012], [0, .76, .237], material);
    for (let i = 0; i < 4; i++) part([.18 + (i % 2) * .15, .014, .008], [-.06, .85 - i * .047, .248], standard('#77cf9c', .8, '#315e45'));
    const deck = part([.82, .07, .35], [0, .5, .29], edge); deck.rotation.x = .15;
    part([.42, .027, .18], [0, .55, .3], metal);
    // A little racing wheel at each side keeps the garage identity without oversized seats.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.1, .018, 5, 12), dark); wheel.position.set(.25, .62, .4); wheel.rotation.x = -.4; body.add(wheel);
    part([.35, .09, .31], [0, .3, .68], standard('#414269'));
    part([.35, .29, .07], [0, .45, .84], navy);
    part([.06, .24, .06], [0, .15, .68], metal);
    part([.4, .035, .36], [0, .03, .68], dark);
    shadow(x, 9.4, .9, 1.1);
  }
  // Four usable desks under the windows; material order matches garage-2…5.
  zone=room;
  for(const [i,x] of [-6.3,-2.1,2.1,6.3].entries()) {
    const z=-3.15;
    box([1.88,.09,.76],[x,.67,z],wood);
    box([.48,.59,.65],[x-.59,.31,z],navy);
    for(let drawer=0;drawer<3;drawer++){
      box([.41,.15,.022],[x-.59,.16+drawer*.17,z+.336],edge);
      box([.2,.021,.019],[x-.59,.2+drawer*.17,z+.354],metal);
    }
    for(const back of [-1,1])box([.055,.61,.055],[x+.76,.32,z+back*.29],metal);
    box([.38,.025,.21],[x,.733,z-.09],dark);
    box([.045,.09,.045],[x,.78,z-.13],edge);
    box([.65,.39,.055],[x,.995,z-.12],dark);
    const screen=standard('#254740',.8,'#173d34');screen.emissiveIntensity=.2;workScreens.push(screen);
    box([.57,.3,.013],[x,1.0,z-.084],screen);
    const ink=standard('#72ac8f',1,'#143628');ink.emissiveIntensity=.12;
    for(let row=0;row<5;row++)box([.13+((i+row)%3)*.075,.012,.007],[x-.12,1.09-row*.044,z-.074],ink);
    box([.49,.025,.17],[x,.735,z+.23],edge);
    for(let row=0;row<3;row++)box([.4,.008,.011],[x,.752,z+.178+row*.04],metal);
    mug(x+.64,.716,z+.12);
    cylinder(.19,.065,[x,.34,-2.5],red);cylinder(.028,.28,[x,.17,-2.5],metal);
    for(const angle of [0,Math.PI/3,Math.PI*2/3]){const foot=box([.39,.03,.037],[x,.025,-2.5],dark);foot.rotation.y=angle;}
    shadow(x,z,1.9,.75);shadow(x,-2.5,.4,.4);
  }
  zone=frontStations;
  // Lockers and the small coffee stop from the reference.
  for (const x of [.5, 1.1]) {
    box([.44, 1.12, .5], [x, .56, 8.95], edge);
    box([.38, 1.02, .025], [x, .56, 9.214], navy);
    for (let i = 0; i < 3; i++) box([.19, .013, .012], [x, .96 - i * .05, 9.234], metal);
    box([.025, .13, .025], [x + .12, .62, 9.24], metal);
  }
  chest(2.1,9.3);
  box([1.55, .55, .6], [3.3, .275, 9.25], navy);
  box([1.62, .08, .65], [3.3, .59, 9.25], wood);
  box([.25, .36, .29], [3.3, .81, 9.27], metal);
  box([.17, .16, .015], [3.3, .8, 9.425], dark); mug(3.75, .64, 9.31);
  shadow(3.3, 9.25, 1.62, .7);

  const lounge = new THREE.Group(); lounge.scale.set(1.17,1,1.04); lounge.position.set(2.55,0,2.472); room.add(lounge); zone = lounge;
  // The lounge is physically down two steps, inset into the concrete slab.
  const loungeY = -.5, purple = standard('#512883', 1, '#10071e'), cushion = standard('#684099', 1, '#12091f');
  box([5, .12, 4.6], [5.3, loungeY - .06, 10.65], standard('#27223d'));
  box([4.4, .018, 3.65], [5.3, loungeY + .015, 10.7], standard('#312047'));
  for (const x of [2.75, 7.85]) { box([.2, .95, 4.8], [x, -.025, 10.65], navy); box([.26, .09, 4.85], [x, .49, 10.65], edge); }
  box([5.3, .55, .18], [5.3, -.225, 13], navy); box([5.3, .08, .26], [5.3, .09, 13], edge);
  // Opening at the front left of the pit, with warm nosings.
  for (let i = 0; i < 3; i++) {
    box([1.08, .18, .32], [3.45, -.083 - i * .167, 8.32 + i * .32], edge);
    box([.91, .02, .025], [3.45, .012 - i * .167, 8.48 + i * .32], wallGlow);
  }
  box([3.52, .43, .65], [5.32, loungeY + .29, 12.08], purple);
  box([3.68, .68, .18], [5.32, loungeY + .43, 12.45], purple);
  for (let i = 0; i < 5; i++) box([.66, .085, .58], [3.94 + i * .69, loungeY + .54, 12.02], cushion);
  for (const x of [3.76, 6.88]) {
    box([.65, .42, 1.83], [x, loungeY + .3, 11.08], purple);
    box([.18, .65, 2.03], [x + (x < 5 ? -.38 : .38), loungeY + .43, 11.12], purple);
    for (let i = 0; i < 3; i++) box([.58, .08, .55], [x, loungeY + .54, 10.53 + i * .58], cushion);
  }
  box([1.34, .11, 1], [5.32, loungeY + .44, 10.95], wood);
  for (const x of [4.77, 5.87]) for (const z of [10.56, 11.34]) box([.06, .4, .06], [x, loungeY + .2, z], dark);
  mug(5.73, loungeY + .5, 10.87); mug(5.06, loungeY + .5, 11.17);
  shadow(5.3, 11.4, 3.7, 2.7, loungeY);
  const readingFixture = new THREE.Group(); lounge.add(readingFixture); zone = readingFixture;
  const readingGlow = warm.clone();
  switchMaterials.push(readingGlow);
  cylinder(.19, .045, [7.39, loungeY + .04, 12.15], dark);
  cylinder(.025, 1.16, [7.39, loungeY + .62, 12.15], metal);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.15, .26, .34, 8), readingGlow); shade.position.set(7.39, loungeY + 1.3, 12.15); zone.add(shade);
  const readingLight = new THREE.PointLight('#ffbc70', 3, 3.5, 2); readingLight.position.set(7.25, loungeY + 1.15, 12); zone.add(readingLight);
  let readingOn = true;
  lightSwitches.push({ id: 'garage-reading-lamp', label: 'Garage reading lamp', kind: 'lamp', target: shade, hitTargets: [readingFixture],
    isOn: () => readingOn, setOn(on) { readingOn = on; readingLight.intensity = on ? 3 : 0; readingGlow.emissiveIntensity = on ? .8 : 0; readingGlow.color.set(on ? '#eed3a0' : '#736c60'); } });
  zone = room;
  const plants = createIndoorPlants(room);
  plants.shelf(-8.15,-3.85);
  plants.plant('palm', 8.9, -3.15, 1.1, 1.1);
  plants.plant('rubber', -5.85, 12.35, .91, 2);
  plants.plant('fern', 2.85, 12.3, .57, 3, .64);
  plants.plant('palm', 11.1, 12.1, 1.03, 4, loungeY);
  plants.plant('calathea', 6.35, 15.35, .7, 2.5, loungeY);
  return { update: (elapsed: number, reduced: boolean) => plants.update(elapsed, reduced), workScreens, lightSwitches, wallFixtures,
    dispose() { switchMaterials.forEach(material => material.dispose()); },
    setWallLightsOn(on: boolean) { wallGlow.emissiveIntensity = on ? .8 : 0; wallGlow.color.set(on ? '#eed3a0' : '#736c60'); } };
}

export function garageConcrete() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(256, 256);
  let seed = 91;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const n = (seed / 4294967296 - .5) * 9;
    pixels.data[i] = 48 + n; pixels.data[i + 1] = 53 + n; pixels.data[i + 2] = 77 + n; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.strokeStyle = '#282d43'; ctx.lineWidth = 1; ctx.strokeRect(.5, .5, 255, 255);
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(.3, .3); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
}
