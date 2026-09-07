import * as THREE from 'three';
import { VendingPilePhysics, VENDING_PILE_LIMIT, type VendingCanBody } from './factory25dVendingPhysics';
import { createSnackGeometry, snackKind, VENDING_SNACK_KINDS, type VendingSnackKind } from './factory25dVendingSnacks';
import { VendingSoundEvents, type VendingSounds } from './factory25dVendingSoundEvents';
import './factory25dVendingDispense.css';

export interface VendingInteractionOptions {
  canvas: HTMLCanvasElement;
  camera: () => THREE.Camera;
  visible: () => boolean;
  sounds?: VendingSounds;
}
export interface VendingDispenseEvents {
  accepted?: () => void;
  released?: (body: VendingCanBody) => void;
  rockAngle?: () => number;
}

/** One batch per snack shape plus one shared floor shadow batch. */
export function createVendingDispenser(root: THREE.Group, events: VendingDispenseEvents = {}) {
  const pile = new VendingPilePhysics();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .61, metalness: .08 });
  const batches = new Map<VendingSnackKind, THREE.InstancedMesh>();
  for (const kind of VENDING_SNACK_KINDS) {
    const mesh = new THREE.InstancedMesh(createSnackGeometry(kind), material, VENDING_PILE_LIMIT);
    mesh.name = `vending-dispensed-${kind}`;
    // The room's visible floor finish sits .018 above its navigation plane.
    mesh.position.y = .019;
    mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    // The compact local pile changes bounds as it grows, and 48 tiny instances
    // are cheaper to keep in the room pass than recomputing bounds every frame.
    mesh.frustumCulled = false; root.add(mesh); batches.set(kind, mesh);
  }

  const shadowMaterial = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 shadowUv; void main() { shadowUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 shadowUv; void main() {
      float falloff = 1.0 - smoothstep(.15, .5, length(shadowUv - .5));
      gl_FragColor = vec4(0.0, 0.0, 0.0, falloff * .2); }`,
    transparent: true, depthWrite: false,
  });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(.14, .14), shadowMaterial, VENDING_PILE_LIMIT);
  shadows.name = 'vending-can-floor-shadows'; shadows.count = 0;
  shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shadows.frustumCulled = false; root.add(shadows);
  const transform = new THREE.Object3D();
  let wasActive = false;
  let lastReleasedId = -1;
  const soundEvents = new VendingSoundEvents();
  let attach: ReturnType<typeof attachVendingInteraction> | undefined;
  const visible = () => (attach?.visible() ?? true) && !document.hidden;
  const dispense = () => {
    const accepted = pile.dispense();
    attach?.announce(accepted);
    soundEvents.select(accepted, visible());
    if (accepted && visible()) events.accepted?.();
    return accepted;
  };
  function syncMeshes() {
    for (const batch of batches.values()) batch.count = 0;
    shadows.count = pile.bodies.length;
    for (const [index, body] of pile.bodies.entries()) {
      const batch = batches.get(snackKind(body.id))!;
      transform.position.copy(body.position); transform.quaternion.copy(body.quaternion); transform.scale.setScalar(1);
      transform.updateMatrix(); batch.setMatrixAt(batch.count++, transform.matrix);
      transform.position.set(body.position.x, .021, body.position.z); transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.setScalar(1 + Math.min(.5, body.position.y) * .4); transform.updateMatrix();
      shadows.setMatrixAt(index, transform.matrix);
    }
    for (const batch of batches.values()) batch.instanceMatrix.needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
  }

  return {
    dispense,
    get bodies(): readonly VendingCanBody[] { return pile.bodies; },
    take(id: number) {
      const taken = pile.take(id);
      // Picking up a sleeping item removes it from the floor in this same frame,
      // even if no remaining body needs another physics update.
      if (taken) { soundEvents.remove(id); syncMeshes(); }
      return taken;
    },
    get count() { return pile.bodies.length; },
    get queued() { return pile.queued; },
    get visible() { return visible(); },
    attachInteraction(options: VendingInteractionOptions) {
      attach?.dispose();
      soundEvents.configure(options.sounds);
      attach = attachVendingInteraction(root, options, dispense, () => pile.bodies.length + pile.queued, () => events.rockAngle?.() ?? 0);
    },
    update(dt: number) {
      // All particles pause offscreen along with the floor, avoiding surprise
      // object movement behind an open room/computer/phone view.
      const isVisible = visible();
      if (isVisible) {
        const before = pile.bodies.length;
        pile.update(dt);
        for (const body of pile.bodies) if (body.id > lastReleasedId) {
          lastReleasedId = body.id; events.released?.(body);
        }
        const active = pile.bodies.some(body => !body.sleeping);
        if (active || wasActive || pile.bodies.length !== before) {
          syncMeshes();
        }
        wasActive = active;
      }
      soundEvents.update(pile.bodies, isVisible);
      attach?.update();
    },
    dispose() {
      attach?.dispose();
      soundEvents.dispose();
      for (const mesh of [...batches.values(), shadows]) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      material.dispose(); shadowMaterial.dispose();
    },
  };
}

function attachVendingInteraction(root: THREE.Group, options: VendingInteractionOptions,
  dispense: () => boolean, count: () => number, rockAngle: () => number) {
  const { canvas } = options;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'vending-dispense';
  button.title = 'dispense a snack'; button.setAttribute('aria-label', 'Dispense a snack from the vending machine');
  Object.assign(button.style, {
    position: 'absolute', zIndex: '7', minWidth: '44px', minHeight: '44px', padding: '0',
    background: 'transparent', border: '0', borderRadius: '6px', cursor: 'pointer',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    if (options.visible()) dispense();
  });
  const status = document.createElement('span'); status.className = 'vending-dispense-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  Object.assign(status.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' });
  canvas.parentElement!.append(button, status);
  const project = new THREE.Vector3();
  return {
    visible: options.visible,
    announce(accepted: boolean) {
      status.textContent = accepted ? `Snack ${count()} selected. Watch the pickup tray.` : 'The pickup area is full.';
    },
    update() {
      button.dataset.rockAngle = rockAngle().toFixed(4);
      button.hidden = !options.visible() || document.hidden;
      if (button.hidden) return;
      root.updateWorldMatrix(true, false);
      const camera = options.camera(); camera.updateMatrixWorld();
      const rect = canvas.getBoundingClientRect();
      const host = canvas.parentElement!.getBoundingClientRect();
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      let inFront = true;
      // Cover the cabinet silhouette without enlarging into adjacent props.
      // The minimum size remains a comfortable touch/keyboard target when far away.
      for (const x of [-.48, .48]) for (const y of [0, 1.36]) for (const z of [-.34, .35]) {
        project.set(x, y, z).applyMatrix4(root.matrixWorld).project(camera);
        if (project.z < -1 || project.z > 1) inFront = false;
        const px = rect.left - host.left + (project.x + 1) * rect.width / 2;
        const py = rect.top - host.top + (1 - project.y) * rect.height / 2;
        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
      }
      if (!inFront || right < 0 || bottom < 0 || left > host.width || top > host.height) { button.hidden = true; return; }
      const width = Math.max(44, right - left), height = Math.max(44, bottom - top);
      button.style.left = `${(left + right - width) / 2}px`; button.style.top = `${(top + bottom - height) / 2}px`;
      button.style.width = `${width}px`; button.style.height = `${height}px`;
      const selected = count();
      button.dataset.drinks = String(selected);
      button.setAttribute('aria-label', selected >= VENDING_PILE_LIMIT
        ? 'Vending machine pickup area is full'
        : `Dispense a snack from the vending machine${selected ? `. ${selected} snack${selected === 1 ? '' : 's'} selected` : ''}`);
    },
    dispose() { button.remove(); status.remove(); },
  };
}
