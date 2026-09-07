import * as THREE from 'three';
import type { TeamMember } from '@shared/team';
import type { WeatherVisualState } from '../sky/weather';
import { avatarTexture } from './factory25dAvatarTexture';
import { applyLandscapeHaze } from './factory25dAtmosphere';
import { LANDSCAPE_LAKE } from './factory25dLandscape';

/** A slow closed circuit with enough shore clearance for the bow and wake. */
export function canoeLakePose(seconds: number) {
  const phase = seconds * Math.PI * 2 / 150;
  return { x: -1.15 + .4 * Math.cos(phase), z: -5.2 + 1.25 * Math.sin(phase),
    yaw: Math.atan2(-1.25 * Math.cos(phase), -.4 * Math.sin(phase)) };
}

/** Small open hull with raised pointed ends, a pale rim and wooden seats.
 * Vertex colours keep the entire sculpted boat in one opaque draw call. */
function canoeGeometry() {
  const positions: number[] = [], colors: number[] = [];
  type Point = [number, number, number];
  const triangle = (a: Point, b: Point, c: Point, color: string) => {
    positions.push(...a, ...b, ...c);
    const tint = new THREE.Color(color);
    for (let i = 0; i < 3; i++) colors.push(tint.r, tint.g, tint.b);
  };
  const quad = (a: Point, b: Point, c: Point, d: Point, color: string) => {
    triangle(a, b, c, color); triangle(a, c, d, color);
  };
  const outline: Array<[number, number]> = [[.135, 0], [.108, -.022], [.055, -.033], [-.055, -.033], [-.108, -.022],
    [-.135, 0], [-.108, .022], [-.055, .033], [.055, .033], [.108, .022]];
  const rim = outline.map(([x, z]): Point => [x, .022 + .013 * (Math.abs(x) / .135) ** 4, z]);
  const inner = rim.map(([x, y, z]): Point => [x * .94, y - .0015, z * .8]);
  const keel = rim.map(([x, , z]): Point => [x * .85, -.011, z * .45]);
  const floor = rim.map(([x, , z]): Point => [x * .78, -.005, z * .42]);
  for (let i = 0; i < rim.length; i++) {
    const next = (i + 1) % rim.length;
    quad(keel[i], keel[next], rim[next], rim[i], '#b76143');
    quad(rim[i], rim[next], inner[next], inner[i], '#dcc99b');
    quad(inner[i], inner[next], floor[next], floor[i], '#83634a');
    triangle(floor[i], floor[next], [0, -.005, 0], '#705540');
    triangle(keel[next], keel[i], [0, -.011, 0], '#884936');
  }
  for (const x of [-.052, .052]) {
    quad([x - .009, .013, -.025], [x - .009, .013, .025], [x + .009, .013, .025], [x + .009, .013, -.025], '#c09b6c');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Saved teammates on the same miniature landscape as the climbers. No new
 * session, fake working agent, control lease or presence update is created. */
export function createLakeCanoe(scene: THREE.Scene, haze: { value: THREE.Color }) {
  const root = new THREE.Group(); root.name = 'lake-canoe'; scene.add(root);
  const boat = new THREE.Group(); boat.name = 'canoe-hull-motion'; root.add(boat);
  const hullMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, flatShading: true, side: THREE.DoubleSide });
  applyLandscapeHaze(hullMaterial, haze, .09);
  const hull = new THREE.Mesh(canoeGeometry(), hullMaterial); hull.name = 'canoe-hull'; boat.add(hull);
  hull.castShadow = hull.receiveShadow = true;
  const paddleMaterial = new THREE.MeshStandardMaterial({ color: '#bda077', roughness: .94 });
  applyLandscapeHaze(paddleMaterial, haze, .09);
  const shaftGeometry = new THREE.BoxGeometry(.0025, .065, .0025);
  const bladeGeometry = new THREE.BoxGeometry(.010, .021, .003);
  // Crop the same pixel painter at the lap. Legs cannot hang through the hull.
  const avatarGeometry = new THREE.PlaneGeometry(.09, .09 * 24 / 32);
  type Passenger = { id: string; signature: string; texture: THREE.CanvasTexture;
    group: THREE.Group; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; paddle: THREE.Group };
  let passengers: Passenger[] = [];
  function appearance(member: TeamMember) {
    const { texture } = avatarTexture(member.avatar, ['paddle']);
    texture.repeat.y = 24 / 32; texture.offset.y = 8 / 32;
    return { texture, signature: JSON.stringify(member.avatar) };
  }
  function remove(person: Passenger) {
    person.group.removeFromParent(); person.texture.dispose(); person.mesh.material.dispose();
  }
  // Broad, faint geometry can become subpixel naturally; no always-one-pixel
  // WebGL lines cutting brightly through the landscape haze.
  const wakeMaterial = new THREE.MeshStandardMaterial({ color: '#abc5c9', roughness: 1,
    transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide });
  applyLandscapeHaze(wakeMaterial, haze, .09);
  const wakePositions: number[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const x = -.09 - i * .034, z = side * (.025 + i * .012);
    wakePositions.push(x, .004, z, x - .026, .004, z + side * .010, x - .027, .004, z + side * .013,
      x, .004, z, x - .027, .004, z + side * .013, x, .004, z + side * .003);
  }
  const wakeGeometry = new THREE.BufferGeometry();
  wakeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wakePositions, 3)); wakeGeometry.computeVertexNormals();
  const wake = new THREE.Mesh(wakeGeometry, wakeMaterial); wake.name = 'canoe-wake'; root.add(wake);
  let time = 32;
  root.visible = false;
  return {
    setVisitors(members: readonly TeamMember[]) {
      const selected = [...new Map(members.map(member => [member.id, member])).values()].slice(0, 2);
      for (const person of passengers) if (!selected.some(member => person.id === member.id)) remove(person);
      passengers = selected.map(member => {
        let person = passengers.find(person => person.id === member.id);
        if (!person) {
          const looks = appearance(member);
          const material = new THREE.MeshStandardMaterial({ map: looks.texture, alphaTest: .08, roughness: 1, side: THREE.DoubleSide });
          applyLandscapeHaze(material, haze, .09);
          const mesh = new THREE.Mesh(avatarGeometry, material); mesh.name = 'canoe-visitor'; mesh.position.y = .049;
          const group = new THREE.Group(); group.add(mesh); boat.add(group);
          const paddle = new THREE.Group(); paddle.name = 'canoe-paddle';
          paddle.add(new THREE.Mesh(shaftGeometry, paddleMaterial));
          const blade = new THREE.Mesh(bladeGeometry, paddleMaterial); blade.position.y = -.04; paddle.add(blade);
          group.add(paddle);
          person = { id: member.id, group, mesh, paddle, ...looks };
        } else if (person.signature !== JSON.stringify(member.avatar)) {
          person.texture.dispose(); Object.assign(person, appearance(member)); person.mesh.material.map = person.texture;
        }
        person.mesh.userData = { visitorId: member.id, visitorName: member.name, activity: 'canoeing' };
        return person;
      });
    },
    update(dt: number, weather: WeatherVisualState, night: boolean, paused: boolean) {
      root.visible = !night && weather.rain01 < .5 && weather.snow01 < .1 && (weather.thunder01 ?? 0) < .1;
      if (!root.visible) return;
      const occupied = passengers.length > 0;
      if (!paused && occupied && Number.isFinite(dt)) time += Math.min(.1, Math.max(0, dt));
      const pose = canoeLakePose(occupied ? time : 32);
      root.position.set(pose.x, LANDSCAPE_LAKE.height, pose.z); root.rotation.y = pose.yaw;
      // Freeze the whole stroke and water motion for reduced motion; weather,
      // roster and placement still update correctly while animation is paused.
      boat.position.y = paused || !occupied ? 0 : Math.sin(time * 1.3) * .0012;
      boat.rotation.x = paused || !occupied ? 0 : Math.sin(time * 2.2) * .018;
      passengers.forEach((person, index) => {
        person.group.position.x = passengers.length === 1 ? -.038 : (index === 0 ? -.052 : .052);
        person.group.rotation.y = -pose.yaw;
        const frame = paused ? 1 : Math.floor(time * 1.6 + index * 2) % 4;
        person.texture.offset.x = frame / 4;
        person.paddle.position.set(.025, .042 + [0, -.003, .002, .010][frame], .031);
        person.paddle.rotation.z = [-.28, .06, .3, -.12][frame];
      });
      wake.visible = occupied && !paused;
      wakeMaterial.opacity = .22 + Math.sin(time * 2.2) * .035;
    },
    dispose() {
      passengers.forEach(remove); passengers = []; root.removeFromParent();
      for (const geometry of [hull.geometry, shaftGeometry, bladeGeometry, avatarGeometry, wakeGeometry]) geometry.dispose();
      for (const material of [hullMaterial, paddleMaterial, wakeMaterial]) material.dispose();
    },
  };
}
