import * as THREE from "three";
import { propPart, standard } from "./factory25dProps";
import { contactShadow } from "./factory25dContactShadows";
import { stepToward, type FloorPoint } from "./factory25dKeyboardState";
import { routeToStation, INTERIOR_Z } from './factory25dWorkstations';
import { createBasketballVisual } from './factory25dBasketballVisual';

const BALL_RADIUS = 0.073;

/** The scoring plane belongs below the rim: a sideways or upward crossing is no basket. */
export function crossedBasket(
  before: THREE.Vector3,
  after: THREE.Vector3,
  rim: THREE.Vector3,
  radius = 0.15,
) {
  if (before.y <= rim.y || after.y > rim.y) return false;
  const t = (before.y - rim.y) / (before.y - after.y);
  return (
    Math.hypot(
      THREE.MathUtils.lerp(before.x, after.x, t) - rim.x,
      THREE.MathUtils.lerp(before.z, after.z, t) - rim.z,
    ) <
    radius - 0.035
  );
}

export function miniBall(parent: THREE.Object3D) {
  return createBasketballVisual(parent, BALL_RADIUS);
}

type Player = { id: string; name: string; position: THREE.Vector3; home: FloorPoint };
interface BasketballSounds {
  tap?: () => void;
  swish?: () => void;
  bounce?: (energy: number) => void;
}
export function createBasketball(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  players: Player[],
  sounds: BasketballSounds = {},
) {
  const hoopScale = 0.84;
  const rim = new THREE.Vector3(1.3, 1.68, -6.18 + 0.22 * hoopScale);
  const pickupRim = new THREE.Object3D(); pickupRim.name = 'agent-dunk-rim'; pickupRim.position.copy(rim); parent.add(pickupRim);
  const hoop = new THREE.Group();
  // Leave space in front of the wet glass so the board and its hardware read clearly.
  hoop.position.set(rim.x, 0, -6.18);
  hoop.scale.setScalar(hoopScale);
  hoop.position.y = rim.y * (1 - hoopScale);
  parent.add(hoop);
  const frame = standard('#36484c', 0.8);
  const orange = standard('#ef6925', 0.75, '#271005');
  const boardY = rim.y + 0.23;
  const resultMaterial = new THREE.MeshBasicMaterial({color:'#17201d',toneMapped:false});
  propPart(hoop, [.48,.08,.035], [0,boardY+.39,.02], frame);
  propPart(hoop, [.42,.045,.012], [0,boardY+.39,.044], resultMaterial);
  let resultTime = 0;
  function showResult(made: boolean) { resultMaterial.color.set(made ? '#41ef78' : '#ff4238'); resultTime = 1.6; }

  const mountingSteel = standard('#a9bbbf', 0.55);
  for (const x of [-0.35, 0.35]) for (const y of [-0.35, 0.35]) {
    propPart(hoop, [0.045, 0.045, 0.09], [x, boardY + y, -0.033], frame);
    propPart(hoop, [0.023, 0.023, 0.009], [x, boardY + y, 0.029], mountingSteel);
  }
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: '#c2e0e5', roughness: 0.12, metalness: 0.08,
    transparent: true, opacity: 0.12, depthWrite: false,
  });
  const board = propPart(hoop, [0.8, 0.8, 0.046], [0, boardY, 0], boardMaterial);
  board.castShadow = false;
  board.receiveShadow = false;
  for (const x of [-0.402, 0.402])
    propPart(hoop, [0.021, 0.82, 0.057], [x, boardY, 0], frame);
  for (const y of [boardY - 0.4, boardY + 0.4])
    propPart(hoop, [0.8, 0.021, 0.057], [0, y, 0], frame);
  // A complete shooting square, with the rim attached at its lower edge.
  for (const x of [-0.16, 0.16])
    propPart(hoop, [0.018, 0.25, 0.008], [x, rim.y + 0.14, 0.029], orange);
  for (const y of [rim.y + 0.015, rim.y + 0.265])
    propPart(hoop, [0.338, 0.018, 0.008], [0, y, 0.029], orange);
  propPart(hoop, [0.1, 0.08, 0.026], [0, rim.y, 0.04], orange);
  propPart(hoop, [0.064, 0.026, 0.15], [0, rim.y, 0.12], orange);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 32), orange);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, rim.y, 0.22);
  hoop.add(ring);
  const netPoints: THREE.Vector3[] = [];
  const netPoint = (row: number, column: number) => {
    const angle = (column + (row % 2) * 0.5) / 12 * Math.PI * 2;
    const radius = [0.145, 0.128, 0.095, 0.075][row];
    return new THREE.Vector3(Math.cos(angle) * radius, rim.y - row * 0.085 - 0.013, 0.22 + Math.sin(angle) * radius);
  };
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    netPoints.push(netPoint(row, i), netPoint(row + 1, i));
    netPoints.push(netPoint(row, i), netPoint(row + 1, i + (row % 2 ? 1 : -1)));
  }
  // Real matte cord responds to moonlight and lamps. Unlit lines stayed white at night.
  const net = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 4),
    standard('#d4cfbb', 1), netPoints.length / 2);
  net.name = 'basketball-net'; net.receiveShadow = true;
  const cord = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  let netAge = 1;
  const netStart = new THREE.Vector3(), netEnd = new THREE.Vector3();
  function paintNet(age: number) {
    // Keep every rim attachment fixed; the lower cords stretch, flare and settle.
    const pulse = age >= 1 ? 0 : Math.sin(age * Math.PI * 3) * Math.exp(-age * 5);
    const flare = age >= 1 ? 0 : Math.sin(Math.min(1, age * 3) * Math.PI) * .07;
    const deform = (source: THREE.Vector3, target: THREE.Vector3) => {
      const depth = (rim.y - .013 - source.y) / .255;
      target.copy(source);
      target.x *= 1 + flare * depth * 6;
      target.z = .22 + (source.z - .22) * (1 + flare * depth * 6);
      target.y -= pulse * .15 * depth;
    };
    for (let i = 0; i < netPoints.length; i += 2) {
      deform(netPoints[i], netStart); deform(netPoints[i + 1], netEnd);
      direction.subVectors(netEnd, netStart);
      cord.position.copy(netStart).add(netEnd).multiplyScalar(.5);
      cord.scale.set(1, direction.length(), 1); cord.quaternion.setFromUnitVectors(up, direction.normalize());
      cord.updateMatrix(); net.setMatrixAt(i / 2, cord.matrix);
    }
    net.instanceMatrix.needsUpdate = true;
  }
  function swishNet() { netAge = 0; }
  paintNet(1);
  net.frustumCulled = false;
  hoop.add(net);
  // Flex the ring and attached net together about the backboard bracket.
  const rimSpring = new THREE.Group(); rimSpring.position.set(0, rim.y, .04); hoop.add(rimSpring);
  ring.position.sub(rimSpring.position); net.position.sub(rimSpring.position);
  rimSpring.add(ring, net);
  let rimAngle = 0, rimVelocity = 0;
  function hitRim(energy: number) { rimVelocity = Math.min(1.2, rimVelocity + Math.max(0, Math.min(1, energy)) * .9); }
  let lastAgentDunk = -Infinity;
  pickupRim.userData.onAgentDunk = () => {
    const now = performance.now();
    if (now - lastAgentDunk < 900) return;
    lastAgentDunk = now;
    hitRim(.25); swishNet(); showResult(true); sounds.swish?.();
  };

  const ball = miniBall(parent),
    spare = miniBall(parent);
  spare.position.set(2.55, BALL_RADIUS, -5.72);
  ball.position.set(0.7, BALL_RADIUS, -5.65);
  const spareShadow = contactShadow(parent, {
    x: 2.55,
    z: -5.72,
    width: 0.12,
    depth: 0.12,
    opacity: 0.25,
    spread: 0.055,
    round: true,
  });
  const ballShadow = contactShadow(parent, {
    x: 0.7,
    z: -5.65,
    width: 0.12,
    depth: 0.12,
    opacity: 0.27,
    spread: 0.055,
    round: true,
  });
  const savedScores: Record<string, number> = Object.create(null);
  try {
    const saved = JSON.parse(localStorage.getItem('factory-window-hoops-v2') ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved))
      for (const [id, value] of Object.entries(saved))
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 100000) savedScores[id] = value;
  } catch {
    /* Local game still works. */
  }
  let scores = players.map(player => savedScores[player.id] ?? 0);
  const call = document.createElement("button");
  call.type = "button";
  call.className = "basket-call"; call.disabled = !players.length;
  call.title = "call an agent for a shot";
  canvas.parentElement!.append(call);
  function updateScoreLabel() {
    call.title = players.length ? 'call an agent for a shot' : 'agents are busy · hoops will be available on their next break';
    call.setAttribute(
      "aria-label",
      `Call an agent for a basketball shot. ${players.map((p, i) => `${p.name}: ${scores[i]}`).join(", ")}. Scores on this device.`,
    );
  }
  updateScoreLabel();
  let active = -1,
    stage: "walk" | "aim" | "throw" | "bank" | "drop" | "bounce" | "return" =
      "walk";
  let wait = 38,
    time = 0,
    attempt = 0,
    queued = false,
    jump = 0,
    scored = false;
  let route: FloorPoint[] = [],
    returnRoute: FloorPoint[] = [];
  const start = new THREE.Vector3(),
    impact = new THREE.Vector3(),
    previous = new THREE.Vector3();
  const project = new THREE.Vector3();
  const localRoute = (from: FloorPoint, to: FloorPoint) => routeToStation(
    {x: from.x, z: from.z + INTERIOR_Z}, {x: to.x, z: to.z + INTERIOR_Z},
  ).map(point => ({x: point.x, z: point.z - INTERIOR_Z}));
  call.addEventListener("click", () => {
    queued = true;
    wait = 0;
  });
  function startTurn() {
    if (!players.length) return;
    active = attempt % players.length;
    attempt++;
    const player = players[active];
    const shootingSpot = { x: 1.3, z: -5.02 };
    route = localRoute(player.position, shootingSpot);
    returnRoute = localRoute(shootingSpot, player.home);
    stage = "walk";
    time = 0;
    jump = 0;
    scored = false;
    queued = false;
  }
  function nextStage(next: typeof stage) {
    stage = next;
    time = 0;
  }
  return {
    swishNet, hitRim, showResult,
    pickups: [ball, spare],
    pickupShadows: [ballShadow, spareShadow],
    setPlayers(next: Player[]) {
      active = -1; queued = false; wait = 38; jump = 0; time = 0;
      ball.position.set(0.7, BALL_RADIUS, -5.65);
      ballShadow.position.x = 0.7; ballShadow.position.z = -5.65;
      players = next; scores = players.map(player => savedScores[player.id] ?? 0); call.disabled = !players.length; updateScoreLabel();
    },
    get active() {
      return active >= 0;
    },
    get player() {
      return active;
    },
    get jump() {
      return jump;
    },
    get posing() {
      return active >= 0 && !["walk", "return"].includes(stage);
    },
    update(
      dt: number,
      camera: THREE.Camera,
      visible: boolean,
      free: boolean,
      reduced: boolean,
    ) {
      if (resultTime > 0) { resultTime = Math.max(0,resultTime-dt); if (!resultTime) resultMaterial.color.set('#17201d'); }
      if (reduced) { rimAngle = 0; rimVelocity = 0; }
      else {
        let remaining = Math.min(.1, Math.max(0, dt));
        while (remaining > 0) {
          const step = Math.min(remaining, 1/120); remaining -= step;
          rimVelocity += (-180 * rimAngle - 12 * rimVelocity) * step;
          rimAngle += rimVelocity * step;
        }
        if (Math.abs(rimAngle) < .0001 && Math.abs(rimVelocity) < .001) { rimAngle = 0; rimVelocity = 0; }
      }
      rimSpring.rotation.x = rimAngle;
      if (netAge < 1) { netAge = reduced ? 1 : Math.min(1, netAge + dt); paintNet(netAge); }
      call.hidden =
        !visible || document.body.classList.contains("inspect-open");
      if (!call.hidden) {
        parent.localToWorld(project.copy(rim)).project(camera);
        call.hidden = project.z < -1 || project.z > 1;
        const x = ((project.x + 1) * canvas.clientWidth) / 2,
          y = ((1 - project.y) * canvas.clientHeight) / 2;
        call.style.left = `${x - 22}px`;
        call.style.top = `${y - 42}px`;
      }
      if (
        !visible ||
        document.hidden ||
        document.body.classList.contains("inspect-open")
      )
        return;
      dt = Math.min(0.1, Math.max(0, dt));
      if (!players.length) return;
      if (active < 0) {
        if (free && (!reduced || queued)) wait -= dt;
        if (wait <= 0 && free) startTurn();
        else return;
      }
      time += dt;
      const player = players[active];
      if (stage === "walk" || stage === "return") {
        const next = stepToward(player.position, route[0], dt * 1.65);
        player.position.x = next.x;
        player.position.z = next.z;
        if (Math.hypot(next.x - route[0].x, next.z - route[0].z) < 0.001) {
          route.shift();
          if (!route.length) {
            if (stage === "walk") nextStage("aim");
            else {
              active = -1;
              wait = queued ? 0 : 100;
              ball.position.set(0.7, BALL_RADIUS, -5.65);
            }
          }
        }
      } else if (stage === "aim") {
        ball.position.set(player.position.x, 0.61, player.position.z - 0.12);
        jump = reduced ? 0 : Math.sin(Math.min(1, time / 0.8) * Math.PI) * 0.12;
        ball.position.y += jump;
        if (time >= 0.6) {
          start.copy(ball.position);
          impact.set(rim.x + (attempt % 3 === 0 ? 0.3 : 0), rim.y + 0.22 * hoopScale, hoop.position.z + 0.032 * hoopScale);
          nextStage("throw");
        }
      } else if (stage === "throw") {
        const t = Math.min(1, time / 0.7);
        ball.position.lerpVectors(start, impact, t);
        ball.position.y += Math.sin(t * Math.PI) * 0.62;
        jump = reduced ? 0 : Math.max(0, 0.06 - time * 0.3);
        if (t === 1) {
          sounds.tap?.();
          start.copy(ball.position);
          nextStage("bank");
        }
      } else if (stage === "bank") {
        const t = Math.min(1, time / 0.3);
        ball.position.lerpVectors(
          start,
          new THREE.Vector3(impact.x, rim.y + 0.08, rim.z),
          t,
        );
        if (t === 1) {
          start.copy(ball.position);
          nextStage("drop");
        }
      } else if (stage === "drop") {
        previous.copy(ball.position);
        ball.position.y = start.y - 2.2 * time * time;
        if (!scored && crossedBasket(previous, ball.position, rim, 0.15 * hoopScale)) {
          scored = true;
          swishNet(); showResult(true); sounds.swish?.();
          scores[active]++;
          savedScores[players[active].id] = scores[active];
          updateScoreLabel();
          try {
            localStorage.setItem(
              "factory-window-hoops-v2",
              JSON.stringify(savedScores),
            );
          } catch {
            /* Session score stays available. */
          }
        }
        if (ball.position.y <= BALL_RADIUS) {
          ball.position.y = BALL_RADIUS;
          sounds.bounce?.(1);
          start.copy(ball.position);
          nextStage("bounce");
        }
      } else if (stage === "bounce") {
        // Only the first two diminishing floor contacts; no frame-rate-dependent chatter.
        const contact = Math.floor(time * 9 / Math.PI);
        if (contact > Math.floor((time - dt) * 9 / Math.PI) && contact <= 2)
          sounds.bounce?.(Math.exp(-time * 4));
        ball.position.z = start.z + Math.min(1, time) * 0.42;
        ball.position.y =
          BALL_RADIUS + Math.abs(Math.sin(time * 9)) * Math.exp(-time * 4) * 0.32;
        if (time > 1.2) {
          route = returnRoute;
          nextStage("return");
        }
      }
      ball.rotation.x += dt * 3;
      ball.rotation.z += dt * 1.3;
      ballShadow.position.x = ball.position.x;
      ballShadow.position.z = ball.position.z;
      ballShadow.scale.set(
        0.23 * (1 + ball.position.y * 0.13),
        0.23 * (1 + ball.position.y * 0.13),
        1,
      );
      canvas.dataset.basketball = active < 0 ? "resting" : stage;
      canvas.dataset.baskets = String(scores.reduce((a, b) => a + b, 0));
    },
  };
}
