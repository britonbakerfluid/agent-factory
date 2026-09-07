/** Read-only geometry audit. Run: node scripts/check-garage-clearance.mjs */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { tsImport } from 'tsx/esm/api';

const { GARAGE_CAR_IDS: ids, GARAGE_CAR_SCALE: scale, GARAGE_CAR_YAW: yaw, GARAGE_CAR_BAYS: bays } =
  await tsImport('../shared/factory25d-garage.ts', import.meta.url);
const { drawCharacter, resolveAvatar, hexToInt } = await tsImport('../client/rendering/avatarPainter.ts', import.meta.url);
const { DEFAULT_AVATAR } = await tsImport('../shared/constants.ts', import.meta.url);
const round = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? +v.toFixed(6) : v));
const box = object => new THREE.Box3().setFromObject(object, true);
const describeBox = b => ({ min: b.min.toArray(), max: b.max.toArray(), size: b.getSize(new THREE.Vector3()).toArray() });
const loader = new GLTFLoader(), models = new Map();

function convexHull(points) {
  const sorted = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = list => { const h = []; for (const p of list) { while (h.length > 1 && cross(h.at(-2), h.at(-1), p) <= 0) h.pop(); h.push(p); } return h; };
  return half(sorted).slice(0, -1).concat(half(sorted.toReversed()).slice(0, -1));
}
const rectangle = (left, right, near, far) => [[left, near], [right, near], [right, far], [left, far]];
function transform(hull, pose) {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return hull.map(([x, z]) => [pose.x + c * x + s * z, pose.z - s * x + c * z]);
}
function overlaps(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = [q[1] - p[1], p[0] - q[0]];
    const ap = a.map(v => v[0] * axis[0] + v[1] * axis[1]), bp = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.max(...ap) <= Math.min(...bp) || Math.max(...bp) <= Math.min(...ap)) return false;
  }
  return true;
}

for (const id of ids) {
  const bytes = await readFile(new URL(`../client/assets/prototype25d/garage/${id}.glb`, import.meta.url));
  const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  const raw = describeBox(box(scene)), points = [], sockets = {}, doors = [];
  scene.traverse(object => {
    if (object.isMesh) {
      const position = object.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld).multiplyScalar(scale);
        points.push([p.x, p.z]);
      }
    }
    if (['driver_socket', 'entry_socket'].includes(object.userData.role))
      sockets[object.userData.role] = object.getWorldPosition(new THREE.Vector3()).toArray();
    if (object.userData.role === 'door') doors.push(object);
  });
  const doorSweeps = doors.map(door => {
    const axis = door.userData.openAxis, storedAngle = door.userData.openAngle;
    // These two exported side-door y signs swing inward; gullwing z signs are correct.
    const outwardAngle = axis === 'y' ? -storedAngle : storedAngle, original = door.rotation[axis];
    const sweep = new THREE.Box3();
    for (let i = 0; i <= 100; i++) {
      door.rotation[axis] = original + outwardAngle * i / 100;
      scene.updateMatrixWorld(true); sweep.union(box(door));
    }
    door.rotation[axis] = original; scene.updateMatrixWorld(true);
    return { name: door.name, axis, storedAngle, outwardAngle,
      scaledSweep: { min: sweep.min.multiplyScalar(scale).toArray(), max: sweep.max.multiplyScalar(scale).toArray() } };
  });
  scene.scale.setScalar(scale); scene.rotation.y = yaw; scene.updateMatrixWorld(true);
  models.set(id, { hull: convexHull(points), raw, sockets, doorSweeps, parkedRelative: describeBox(box(scene)) });
}

// Minimal alpha-only Canvas implementation: canonical painter uses rectangles.
function avatarBounds(animation, frame) {
  const alpha = new Float64Array(32 * 32);
  const ctx = { fillStyle: '#000', globalAlpha: 1,
    clearRect(x, y, w, h) { for (let py = Math.max(0, y); py < Math.min(32, y + h); py++) for (let px = Math.max(0, x); px < Math.min(32, x + w); px++) alpha[py * 32 + px] = 0; },
    fillRect(x, y, w, h) {
      const match = String(this.fillStyle).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
      const opacity = (match ? Number(match[1]) : 1) * this.globalAlpha;
      for (let py = Math.max(0, y); py < Math.min(32, y + h); py++) for (let px = Math.max(0, x); px < Math.min(32, x + w); px++) {
        const index = py * 32 + px; alpha[index] = opacity + alpha[index] * (1 - opacity);
      }
    },
  };
  const colors = resolveAvatar(DEFAULT_AVATAR);
  drawCharacter(ctx, 0, 0, 32, hexToInt(colors.shirtColor), animation, frame, colors);
  const pixels = [...alpha.entries()].filter(([, a]) => a * 255 >= 20).map(([i]) => [i % 32, Math.floor(i / 32)]);
  const minY = Math.min(...pixels.map(p => p[1])), maxY = Math.max(...pixels.map(p => p[1]));
  return { minY, maxY, height: (maxY - minY + 1) / 32 * .86, topAbovePlaneCenter: (16 - minY) / 32 * .86 };
}

// Proposed low-speed maneuver, not runtime vehicle physics. Scene-local x/z.
const radius = 2.2, aisleZ = 8.7, rampX = 10.815, turnStartX = rampX - radius, rampStraightZ = aisleZ - radius;
const arcStartZ = aisleZ + radius * (1 - Math.sin(yaw));
const reverseDistance = (arcStartZ - .25) / -Math.cos(yaw);
const furniture = [
  // Conservative strips enclose current front workbench, stools, workstations, lockers and coffee stop.
  { name: 'front furniture', polygon: rectangle(-11.8, 4.2, 11.6, 13.8) },
  { name: 'lounge', polygon: rectangle(5.65, 11.85, 10.99, 16.1) },
  ...[-6.3, -2.1, 2.1, 6.3].map(x => ({ name: `window desk ${x}`, polygon: rectangle(x - 1.1, x + 1.1, -3.6, -2.18) })),
  { name: 'plant shelf', polygon: rectangle(-8.775, -7.525, -4.1, -3.6) },
];
const curbs = [
  { name: 'left ramp curb', polygon: rectangle(9.72, 9.86, -4.12, 5.22) },
  { name: 'right ramp curb', polygon: rectangle(11.77, 11.91, -4.12, 5.22) },
];
const routeResults = [];
for (const id of ids) {
  const model = models.get(id), bay = bays[id];
  const arcStart = { x: bay.x - reverseDistance * Math.sin(yaw), z: arcStartZ, yaw };
  const arcEnd = { x: arcStart.x - radius * Math.cos(yaw), z: aisleZ, yaw: Math.PI / 2 };
  const poses = [];
  const append = (phase, count, getPose) => { for (let i = 0; i <= count; i++) poses.push({ phase, ...getPose(i / count) }); };
  append('reverse', 600, t => ({ x: bay.x - t * reverseDistance * Math.sin(yaw), z: bay.z - t * reverseDistance * Math.cos(yaw), yaw }));
  append('forward right turn', 400, t => {
    const angle = yaw + t * (Math.PI / 2 - yaw);
    return { x: arcStart.x + radius * (Math.cos(angle) - Math.cos(yaw)), z: arcStart.z - radius * (Math.sin(angle) - Math.sin(yaw)), yaw: angle };
  });
  append('east aisle', 600, t => ({ x: arcEnd.x + t * (turnStartX - arcEnd.x), z: aisleZ, yaw: Math.PI / 2 }));
  append('ramp corner', 900, t => ({ x: turnStartX + radius * Math.sin(t * Math.PI / 2), z: rampStraightZ + radius * Math.cos(t * Math.PI / 2), yaw: Math.PI / 2 + t * Math.PI / 2 }));
  // Stop the 2D audit before the crest: ground contact and exit geometry need separate work.
  append('straight ramp', 400, t => ({ x: rampX, z: rampStraightZ + t * (-2.5 - rampStraightZ), yaw: Math.PI }));
  const others = ids.filter(other => other !== id).map(other => ({ name: `parked ${other}`, polygon: transform(models.get(other).hull, { ...bays[other], yaw }) }));
  const obstacles = [...furniture, ...curbs, ...others];
  let minWallGap = Infinity, quarterMaxX = -Infinity, quarterMaxZ = -Infinity, quarterMinZ = Infinity;
  const collisions = [];
  for (const pose of poses) {
    const polygon = transform(model.hull, pose);
    const xs = polygon.map(p => p[0]), zs = polygon.map(p => p[1]);
    const wallGap = Math.min(Math.min(...xs) + 11.81, 11.81 - Math.max(...xs));
    minWallGap = Math.min(minWallGap, wallGap);
    if (wallGap < 0) collisions.push(`${pose.phase}: room wall`);
    for (const obstacle of obstacles) if (overlaps(polygon, obstacle.polygon)) collisions.push(`${pose.phase}: ${obstacle.name}`);
    if (pose.phase === 'ramp corner') {
      quarterMaxX = Math.max(quarterMaxX, ...xs); quarterMaxZ = Math.max(quarterMaxZ, ...zs); quarterMinZ = Math.min(quarterMinZ, ...zs);
    }
  }
  const failures = [...new Set(collisions)];
  routeResults.push({ id, bay, reverseDistance, arcStart, arcEnd, cornerStart: { x: turnStartX, z: aisleZ }, cornerEnd: { x: rampX, z: rampStraightZ },
    samples: poses.length, minWallGap, quarterMaxX, quarterMaxZ, quarterMinZ, collisions: failures });
  assert.equal(failures.length, 0, `${id}: ${failures.join(', ')}`);
  assert.ok(model.raw.size[0] * scale < 1.91, `${id} must fit between ramp curbs`);
}

console.log(JSON.stringify(round({ scale, yaw, avatar: { idle: avatarBounds('idle', 0), sit: avatarBounds('sit', 0), walkUp: avatarBounds('walk_up', 0) },
  ramp: { clearWidth: 1.91, innerWallX: 11.81, slopeDegrees: Math.atan(1.25 / 9.3) * 180 / Math.PI, portalHeadroom: 1.57 },
  models: Object.fromEntries([...models].map(([id, { hull, ...model }]) => [id, model])), routes: routeResults }), null, 2));
console.log(`PASS: ${ids.length} cars; closed-mesh convex hulls clear other parked cars, furniture, walls and ramp curbs on ${routeResults[0].samples} sampled poses each. Crest/driving dynamics are not validated.`);
