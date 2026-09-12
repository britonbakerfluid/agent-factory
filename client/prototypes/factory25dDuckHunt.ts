import * as THREE from "three";
import { requireElement } from "./dom";
import { createDuckHud, type DuckTallyMark } from "./factory25dDuckHud";

/**
 * Patio duck hunt with the shape of the arcade original: a round is five waves
 * of two ducks, three shells per wave with an automatic reload between waves,
 * a stated hit quota to clear the round and ducks that get quicker each round.
 * Downtime between waves stays under a second.
 */
export const DUCK_WAVES = 5;
export const DUCKS_PER_WAVE = 2;
export const SHOTS_PER_WAVE = 3;
export const DUCKS_PER_ROUND = DUCK_WAVES * DUCKS_PER_WAVE;
export const WAVE_PAUSE_SECONDS = 0.85;
/** Hits needed to clear a round: six of ten to start, up to nine of ten. */
export function duckQuota(round: number) {
  return Math.min(9, 5 + Math.max(1, Math.floor(round)));
}
/** Faster, jumpier and shorter flights as rounds go on; capped so the ducks stay hittable. */
export function duckDifficulty(round: number) {
  const step = Math.max(0, Math.floor(round) - 1);
  return {
    speed: Math.min(3.4, 1.55 + step * 0.28),
    flightSeconds: Math.max(3.2, 5.6 - step * 0.4),
    wobble: Math.min(1.4, 0.55 + step * 0.15),
  };
}
export type DuckPhase = 'idle' | 'wave' | 'between' | 'result';
export type DuckOutcome = 'cleared' | 'failed';

/** Round bookkeeping only; flight animation and timing of wave close-out belong to the view. */
export class DuckRound {
  round = 1;
  wave = 0;
  shots = SHOTS_PER_WAVE;
  hits = 0;
  phase: DuckPhase = 'idle';
  outcome: DuckOutcome | undefined;
  /** Seconds into the current wave's flight. */
  elapsed = 0;
  pause = 0;
  hit = new Set<number>();
  results: DuckTallyMark[] = [];
  get active() { return this.phase === 'wave' || this.phase === 'between'; }
  get quota() { return duckQuota(this.round); }
  get difficulty() { return duckDifficulty(this.round); }
  get waveComplete() { return this.phase === 'wave' && this.hit.size === DUCKS_PER_WAVE; }
  /** Remaining ducks fly off once the shells are spent or the flight time is up. */
  get escaping() {
    return this.phase === 'wave' && this.hit.size < DUCKS_PER_WAVE
      && (this.shots === 0 || this.elapsed >= this.difficulty.flightSeconds);
  }
  /** Ten marks in flight order: settled waves, the current wave, then pending. */
  get tally(): DuckTallyMark[] {
    const marks: DuckTallyMark[] = [...this.results];
    if (this.phase === 'wave') for (let i = 0; i < DUCKS_PER_WAVE; i++) marks.push(this.hit.has(i) ? 'hit' : 'pending');
    while (marks.length < DUCKS_PER_ROUND) marks.push('pending');
    return marks.slice(0, DUCKS_PER_ROUND);
  }
  start() {
    this.phase = 'wave'; this.wave = 1; this.hits = 0; this.results = []; this.outcome = undefined;
    this.loadWave();
  }
  /** After a result: a cleared round moves on, a failed one starts over at round one. */
  continue() {
    if (this.phase !== 'result') return;
    this.round = this.outcome === 'cleared' ? Math.min(99, this.round + 1) : 1;
    this.start();
  }
  /** Leaving mid-round abandons it without a result; the round number is kept. */
  end() { this.phase = 'idle'; this.hit.clear(); this.outcome = undefined; this.elapsed = 0; this.pause = 0; }
  private loadWave() { this.shots = SHOTS_PER_WAVE; this.hit.clear(); this.elapsed = 0; }
  /** One shell per call. A duck counts once per wave; `null` is a shot into the sky. */
  shoot(target: number | null) {
    if (this.phase !== 'wave' || this.shots === 0 || this.escaping) return false;
    this.shots--;
    if (target === null || target < 0 || target >= DUCKS_PER_WAVE || this.hit.has(target)) return false;
    this.hit.add(target);
    this.hits++;
    return true;
  }
  /** Settle the wave: every duck not hit flew away. The last wave decides the round. */
  closeWave() {
    if (this.phase !== 'wave') return;
    for (let i = 0; i < DUCKS_PER_WAVE; i++) this.results.push(this.hit.has(i) ? 'hit' : 'miss');
    if (this.wave >= DUCK_WAVES) {
      this.phase = 'result';
      this.outcome = this.hits >= this.quota ? 'cleared' : 'failed';
    } else {
      this.phase = 'between';
      this.pause = WAVE_PAUSE_SECONDS;
    }
  }
  tick(dt: number) {
    const step = Math.max(0, Math.min(dt, 0.1));
    if (this.phase === 'wave') this.elapsed += step;
    else if (this.phase === 'between') {
      this.pause -= step;
      if (this.pause <= 0) { this.wave++; this.loadWave(); this.phase = 'wave'; }
    }
  }
}

function pixelTexture(canvas: HTMLCanvasElement, repeatX = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, 1);
  return texture;
}

/** Original pixel reeds: blades with a few seed heads, opaque along the bottom rows. */
function reedTexture(seed: number, blades: string[], heads: string, density: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  let state = seed;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  ctx.fillStyle = blades[0];
  ctx.fillRect(0, 84, 256, 12);
  for (let i = 0; i < density; i++) {
    const x = Math.floor(random() * 256), height = 18 + Math.floor(random() * 62), width = random() < 0.35 ? 2 : 1;
    const lean = random() < 0.5 ? -1 : 1, color = blades[Math.floor(random() * blades.length)];
    ctx.fillStyle = color;
    for (let y = 0; y < height; y++) {
      const drift = Math.floor((y / height) * (y / height) * 5) * lean;
      ctx.fillRect((x + drift + 256) % 256, 95 - y, width, 1);
    }
    if (random() < 0.16) {
      ctx.fillStyle = heads;
      ctx.fillRect((x + 4 * lean + 255) % 256, 95 - height - 7, 3, 8);
    }
  }
  return pixelTexture(canvas, 2);
}

/** Read-only view of the game's model for the island HUD and gallery. */
export type DuckHuntOptions = {
  /** The room's sky gradient; sampled along its top row to continue the sky above the mountains. */
  sky?: THREE.Texture;
  /** Fires when the hunt view opens or closes, so the backdrop can switch to its close-up detail. */
  onActive?(active: boolean): void;
};

export function createDuckHunt(scene: THREE.Scene, canvas: HTMLCanvasElement, options: DuckHuntOptions = {}) {
  const round = new DuckRound();
  const events = new AbortController(), listen = { signal: events.signal };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const play = requireElement<HTMLButtonElement>("#duck-play");
  const hud = createDuckHud(requireElement<HTMLElement>("#duck-status"));

  // A stable orthographic view from the deck edge: reeds along the bottom, the
  // valley in the middle, open sky above. The near plane keeps the deck and its
  // furniture out of the frame; only the backdrop and the game props are closer than -4.15.
  const gameCamera = new THREE.OrthographicCamera();
  const CENTER_X = 16, EYE_Z = -4.05, FRAME_BOTTOM = -0.55, MAX_HEIGHT = 5.4, BACKDROP_WIDTH = 15.84;
  let cameraBlend = 0, viewHeight = MAX_HEIGHT, halfWidth = 3.4, viewTop = FRAME_BOTTOM + MAX_HEIGHT;
  let wasOpen = false;

  const stage = new THREE.Group(); stage.name = 'duck-hunt-stage'; stage.visible = false; scene.add(stage);
  const disposables: Array<{ dispose(): void }> = [];
  if (options.sky) {
    const geometry = new THREE.PlaneGeometry(BACKDROP_WIDTH, 4.2);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.995);
    const material = new THREE.MeshBasicMaterial({ map: options.sky });
    const sky = new THREE.Mesh(geometry, material);
    sky.position.set(CENTER_X, 3.61 + 2.1, -4.63); sky.name = 'duck-hunt-sky';
    stage.add(sky); disposables.push(geometry, material);
  }
  // Solid ground behind the reeds: the painted backdrop ends at the meadow line, and the
  // frame's bottom edge sits below it.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BACKDROP_WIDTH + 2, 1.6), new THREE.MeshBasicMaterial({ color: '#1d3a2b' }));
  ground.position.set(CENTER_X, FRAME_BOTTOM + 0.3, -4.4); ground.name = 'duck-hunt-ground';
  stage.add(ground); disposables.push(ground.geometry, ground.material);
  const reedLayers = [
    { texture: reedTexture(7, ['#274a33', '#2f5a3a', '#37663f'], '#6b4a2c', 120), width: 17.5, height: 1.05, y: 0.32, z: -4.31, sway: 0.0012 },
    { texture: reedTexture(19, ['#4a8342', '#5f9a4c', '#79b45a'], '#8a6236', 160), width: 17.5, height: 1.15, y: -0.08, z: -4.22, sway: 0.002 },
  ].map(layer => {
    const material = new THREE.MeshBasicMaterial({ map: layer.texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(layer.width, layer.height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(CENTER_X, layer.y, layer.z); mesh.name = 'duck-hunt-reeds';
    stage.add(mesh); disposables.push(geometry, material, layer.texture);
    return { mesh, texture: layer.texture, sway: layer.sway };
  });

  // Solid, flat-shaded pieces use the same simple construction as the room props.
  const palette = ['#886950', '#bca47a', '#28654f', '#eee1bb', '#d99b3e', '#172827', '#4e6864', '#427b9c'].map(color => {
    const material = new THREE.MeshStandardMaterial({ color, roughness:1, flatShading:true });
    disposables.push(material); return material;
  });
  const cube = new THREE.BoxGeometry(1,1,1); disposables.push(cube);
  function model() {
    const mesh = new THREE.Group();
    const part = (parent: THREE.Group, color: number, x: number,y: number,z: number,w: number,h: number,d: number) => {
      const block = new THREE.Mesh(cube,palette[color]); block.position.set(x,y,z); block.scale.set(w,h,d); parent.add(block); return block;
    };
    part(mesh,0,-.035,0,0,.34,.19,.22);
    part(mesh,1,-.04,-.055,0,.28,.10,.20);
    part(mesh,0,.10,.06,0,.14,.20,.17);
    part(mesh,3,.13,.15,0,.12,.045,.15);
    part(mesh,2,.15,.235,0,.16,.14,.15);
    part(mesh,4,.265,.215,0,.12,.045,.11);
    for (const side of [-1,1]) {
      part(mesh,5,.19,.26,side*.078,.027,.027,.012);
      part(mesh,4,-.10,-.115,side*.065,.10,.025,.035);
    }
    const tail = part(mesh,6,-.235,.035,0,.13,.055,.16); tail.rotation.z=-.25;
    const wings = [-1,1].map(side => {
      const wing = new THREE.Group(); wing.position.set(-.04,.065,side*.07); mesh.add(wing);
      part(wing,6,-.035,0,side*.12,.23,.045,.26);
      part(wing,1,-.055,0,side*.27,.19,.035,.09);
      part(wing,7,-.095,.027,side*.16,.065,.014,.15);
      return wing;
    });
    return {mesh,wings};
  }
  const DUCK_Z = -4.05, DUCK_W = 0.66, DUCK_H = 0.64;
  type Duck = { mesh: THREE.Group; wings: THREE.Group[]; button: HTMLButtonElement; x: number; y: number; vx: number; vy: number; scale: number; turnIn: number; state: 'flying' | 'falling' | 'escaping' | 'gone'; age: number };
  const ducks: Duck[] = Array.from({ length: DUCKS_PER_WAVE }, (_, i) => {
    const {mesh,wings} = model();
    mesh.name = `duck-hunt-mallard-${i}`; mesh.visible = false; stage.add(mesh);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duck-target";
    button.hidden = true;
    button.setAttribute("aria-label", `Shoot duck ${i + 1}`);
    button.addEventListener("click", (event) => { event.stopPropagation(); shoot(i); }, listen);
    canvas.parentElement!.append(button);
    return { mesh, wings, button, x: CENTER_X, y: 0, vx: 0, vy: 0, scale: 0.8, turnIn: 0, state: 'gone', age: 0 };
  });

  // Deterministic per wave so a round plays the same way for everyone testing it.
  let rng = 1;
  const random = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  let flightClock = 0, enabled = false, wasActive = false, finishedAt = 0, resultShown = false;
  let message = '', messageUntil = 0, launchedWave = 0;
  let best = 0, bestRound = 0;
  const storage = { best: 'factory-patio-ducks-best', round: 'factory-patio-ducks-round' };
  try {
    best = Math.max(0, Math.min(DUCKS_PER_ROUND, Number(localStorage.getItem(storage.best)) || 0));
    bestRound = Math.max(0, Math.min(99, Number(localStorage.getItem(storage.round)) || 0));
  } catch { /* Play without storage. */ }

  function say(text: string, seconds = 1.4) { message = text; messageUntil = performance.now() + seconds * 1000; paint(); }
  function launchWave() {
    launchedWave = round.wave; flightClock = 0;
    rng = (round.round * 7919 + round.wave * 104729) >>> 0;
    const { speed } = round.difficulty;
    ducks.forEach((duck, i) => {
      const side = i === 0 ? -1 : 1;
      duck.state = 'flying'; duck.age = 0; duck.turnIn = 0.5 + random() * 0.6;
      duck.x = CENTER_X + side * (0.5 + random() * Math.max(0.6, halfWidth * 0.55));
      duck.y = reduced.matches ? 2.1 + i * 0.7 : 0.15;
      const angle = THREE.MathUtils.degToRad(58 + random() * 64) ;
      duck.vx = Math.cos(angle) * speed * (random() < 0.5 ? -1 : 1);
      duck.vy = Math.sin(angle) * speed;
      duck.scale = reduced.matches ? 0.72 : 0.86;
      duck.mesh.visible = true;
    });
    say(round.wave === 1 ? `round ${round.round} · need ${round.quota} of ${DUCKS_PER_ROUND}` : `wave ${round.wave} of ${DUCK_WAVES}`, 1.6);
  }
  function shoot(index: number | null) {
    if (!enabled || round.phase !== 'wave') return;
    const before = round.shots;
    const hit = round.shoot(index);
    if (round.shots === before) return;
    if (hit && index !== null) { ducks[index].state = 'falling'; ducks[index].age = 0; ducks[index].vy = 0.6; say('hit!'); }
    else if (round.escaping) say(round.hit.size ? 'one flew away' : 'flew away', 1.8);
    else say(round.shots === 1 ? 'last shell' : 'miss', 1);
    paint();
  }
  function finishRound() {
    finishedAt = performance.now(); resultShown = true;
    best = Math.max(best, round.hits);
    if (round.outcome === 'cleared') bestRound = Math.max(bestRound, round.round);
    try { localStorage.setItem(storage.best, String(best)); localStorage.setItem(storage.round, String(bestRound)); } catch { /* Scores stay local to the session. */ }
  }
  function leave() { if (round.active) { round.end(); launchedWave = 0; for (const duck of ducks) duck.state = 'gone'; message = ''; paint(); } }
  play.addEventListener("click", () => {
    if (round.active) { leave(); return; }
    if (cameraBlend > 0) return;
    if (round.phase === 'result') round.continue(); else round.start();
    launchWave(); finishedAt = 0; resultShown = false; paint();
  }, listen);
  canvas.addEventListener("click", () => { if (round.phase === 'wave') shoot(null); }, listen);
  document.addEventListener("keydown", (event) => {
    if (round.active && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); leave(); }
  }, { ...listen, capture: true });

  let canvasWidth = canvas.clientWidth, canvasHeight = canvas.clientHeight;
  const canvasSize = new ResizeObserver(() => { canvasWidth = canvas.clientWidth; canvasHeight = canvas.clientHeight; });
  canvasSize.observe(canvas);

  const playIcon = '<svg class="duck-play-icon" aria-hidden="true" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#f2ac42" d="M2 8h10v5H4v-1H2z"/><path fill="#ffe08a" d="M3 8h5v3H3z"/><path fill="#42865a" d="M9 3h4v1h1v5h-5z"/><path fill="#f6eed3" d="M9 8h5v1H9z"/><path fill="#e3782b" d="M13 5h3v2h-3z"/><path fill="#172a24" d="M11 4h1v1h-1z"/><path fill="#bd642e" d="M5 12h7v1H5z"/></svg>';
  let playState = '';
  function paint() {
    const now = performance.now();
    const live = message && now < messageUntil ? message : '';
    let text: string;
    if (round.phase === 'wave' || round.phase === 'between') text = live || (round.phase === 'between' ? `${round.hits} of ${DUCKS_PER_ROUND} · need ${round.quota}` : `need ${round.quota}`);
    else if (round.phase === 'result') text = round.outcome === 'cleared'
      ? `round ${round.round} cleared · ${round.hits}/${DUCKS_PER_ROUND}`
      : `round over · ${round.hits}/${DUCKS_PER_ROUND} · needed ${round.quota}`;
    else text = bestRound ? `best round ${bestRound} · ${best} hits` : `${DUCK_WAVES} waves · ${SHOTS_PER_WAVE} shells each`;
    hud.paint({ round: round.round, shots: round.active ? round.shots : SHOTS_PER_WAVE, tally: round.phase === 'idle' ? [] : round.tally, quota: round.quota, message: text });
    const state = round.active ? 'active' : round.phase === 'result' ? round.outcome! : 'idle';
    if (playState !== state) {
      playState = state;
      play.dataset.gameActive = String(round.active);
      play.innerHTML = state === 'active' ? 'end round' : `${playIcon}<span>${state === 'cleared' ? 'next round' : state === 'failed' ? 'play again' : 'duck hunt'}</span>`;
      play.setAttribute('aria-label', state === 'active' ? 'End duck hunt round' : state === 'cleared' ? `Play round ${round.round + 1}` : state === 'failed' ? 'Play duck hunt again from round 1' : 'Play duck hunt');
    }
  }
  paint();

  const point = new THREE.Vector3(), edge = new THREE.Vector3();
  return {
    isActive: () => round.active || cameraBlend > 0,
    cameraFor(base: THREE.OrthographicCamera | THREE.PerspectiveCamera, dt: number) {
      cameraBlend = reduced.matches ? Number(round.active) : THREE.MathUtils.clamp(cameraBlend + (round.active ? 1 : -1) * dt / 0.5, 0, 1);
      const open = round.active || cameraBlend > 0;
      if (open !== wasOpen) {
        wasOpen = open; document.body.classList.toggle('duck-hunt-open', open); stage.visible = open;
        options.onActive?.(open);
      }
      if (!cameraBlend || !(base instanceof THREE.OrthographicCamera)) return base;
      const t = cameraBlend * cameraBlend * (3 - 2 * cameraBlend);
      const aspect = canvasWidth / Math.max(1, canvasHeight);
      // Never wider than the painted backdrop; wide screens trade height for width.
      viewHeight = Math.min(MAX_HEIGHT, (BACKDROP_WIDTH - 0.3) / aspect);
      halfWidth = viewHeight * aspect / 2; viewTop = FRAME_BOTTOM + viewHeight;
      const centerY = FRAME_BOTTOM + viewHeight / 2;
      gameCamera.copy(base);
      gameCamera.position.set(CENTER_X, centerY, EYE_Z); gameCamera.lookAt(CENTER_X, centerY, -5);
      gameCamera.position.lerp(base.position, 1 - t); gameCamera.quaternion.slerp(base.quaternion, 1 - t);
      const h = THREE.MathUtils.lerp((base.top - base.bottom) / base.zoom, viewHeight, t);
      gameCamera.zoom = 1; gameCamera.left = -h * aspect / 2; gameCamera.right = h * aspect / 2;
      gameCamera.top = h / 2; gameCamera.bottom = -h / 2;
      gameCamera.updateProjectionMatrix(); gameCamera.updateMatrixWorld(); return gameCamera;
    },
    dispose() {
      canvasSize.disconnect(); events.abort(); hud.dispose();
      for (const duck of ducks) { duck.mesh.removeFromParent(); duck.button.remove(); }
      stage.removeFromParent(); for (const item of disposables) item.dispose();
      document.body.classList.remove('duck-hunt-open', 'duck-round-result');
      if (wasOpen) options.onActive?.(false);
    },
    update(dt: number, camera: THREE.Camera, visible: boolean) {
      enabled = visible && !document.hidden && !document.body.classList.contains("inspect-open");
      if (!visible && round.active) leave();
      const step = Math.max(0, Math.min(dt, 0.1));
      if (enabled) round.tick(step);
      if (round.phase === 'wave' && round.wave !== launchedWave) launchWave();
      if (round.phase === 'result' && !resultShown) { finishRound(); paint(); }
      if (wasActive && !round.active) paint();
      wasActive = round.active;
      const showResult = round.phase === 'result' && finishedAt > 0 && performance.now() - finishedAt < 5000;
      if (document.body.classList.contains('duck-round-result') !== showResult) document.body.classList.toggle('duck-round-result', showResult);
      if (message && performance.now() >= messageUntil) { message = ''; paint(); }
      // Test hook, like the other scene systems: phase, wave, shells left and hits.
      const summary = `${round.phase}:${round.wave}:${round.shots}:${round.hits}`;
      if (canvas.dataset.duckHunt !== summary) canvas.dataset.duckHunt = summary;
      if (enabled && round.phase === 'wave') {
        flightClock += step;
        const { wobble } = round.difficulty;
        if (round.escaping && ducks.some(duck => duck.state === 'flying')) {
          // Time ran out (spent shells are announced by the shot itself).
          if (round.shots > 0) say(round.hit.size ? 'one flew away' : 'flew away', 1.8);
          for (const duck of ducks) if (duck.state === 'flying') { duck.state = 'escaping'; duck.age = 0; }
        }
        for (const duck of ducks) {
          if (duck.state === 'gone') continue;
          duck.age += step;
          if (reduced.matches) {
            // Reduced motion: ducks hold a spot; hits and escapes resolve without travel.
            if (duck.state !== 'flying') duck.state = 'gone';
            continue;
          }
          if (duck.state === 'flying') {
            duck.turnIn -= step;
            if (duck.turnIn <= 0) {
              duck.turnIn = 0.45 + random() * 0.7;
              const speed = Math.hypot(duck.vx, duck.vy), angle = Math.atan2(duck.vy, duck.vx) + (random() - 0.5) * 1.6 * wobble;
              duck.vx = Math.cos(angle) * speed; duck.vy = Math.sin(angle) * speed;
            }
            duck.x += duck.vx * step; duck.y += duck.vy * step;
            // Ducks turn back inside the frame, like the arcade sky.
            if (duck.x < CENTER_X - halfWidth + 0.4) { duck.x = CENTER_X - halfWidth + 0.4; duck.vx = Math.abs(duck.vx); }
            if (duck.x > CENTER_X + halfWidth - 0.4) { duck.x = CENTER_X + halfWidth - 0.4; duck.vx = -Math.abs(duck.vx); }
            if (duck.y > viewTop - 0.5) { duck.y = viewTop - 0.5; duck.vy = -Math.abs(duck.vy) * 0.8; }
            if (duck.y < 1.0 && duck.vy < 0) duck.vy = Math.abs(duck.vy);
            // Higher ducks read as further away.
            duck.scale = THREE.MathUtils.lerp(0.86, 0.6, THREE.MathUtils.clamp((duck.y - 0.5) / 3.6, 0, 1));
          } else if (duck.state === 'falling') {
            duck.vy -= 9.8 * step; duck.y += duck.vy * step; duck.x += duck.vx * 0.15 * step;
            if (duck.y < -0.2 || duck.age > 1.4) duck.state = 'gone';
          } else if (duck.state === 'escaping') {
            duck.vy = Math.min(5.5, Math.abs(duck.vy) + 9 * step); duck.y += duck.vy * step; duck.x += duck.vx * 0.5 * step;
            duck.scale = Math.max(0.5, duck.scale - step * 0.25);
            if (duck.y > viewTop + 0.6) duck.state = 'gone';
          }
        }
        // Every duck settled: hit ones have fallen, the rest have flown off.
        if (ducks.every(duck => duck.state === 'gone')) {
          round.closeWave();
          if (round.active) say(`${round.hits} of ${DUCKS_PER_ROUND} · need ${round.quota}`, WAVE_PAUSE_SECONDS);
          paint();
        }
      }

      if (stage.visible && !reduced.matches) for (const layer of reedLayers) layer.texture.offset.x = Math.sin(performance.now() / 1300) * layer.sway;
      ducks.forEach((duck, i) => {
        const { mesh, button } = duck;
        const direction = duck.vx < 0 ? -1 : 1;
        mesh.visible = round.phase === 'wave' && duck.state !== 'gone';
        if (mesh.visible) {
          mesh.position.set(duck.x, duck.y, DUCK_Z);
          mesh.scale.setScalar(duck.scale);
          // Face travel without mirroring the model. Upward flight pitches the bill up.
          mesh.rotation.y = direction < 0 ? Math.PI + .25 : -.25;
          const pitch = Math.atan2(duck.vy, Math.max(.3,Math.abs(duck.vx)));
          mesh.rotation.z = duck.state === 'falling' ? direction * -Math.min(duck.age * 3,1.5) : direction * THREE.MathUtils.clamp(pitch*.45,-.35,.65);
          const poses = [-.95,-.35,.5,.95,.35,-.5];
          const flap = reduced.matches ? .15 : duck.state === 'falling' ? .75 : poses[Math.floor(flightClock*10+i*2)%poses.length];
          duck.wings.forEach((wing,index) => { wing.rotation.x = (index === 0 ? -1 : 1)*flap; });
        }
        const hidden = !mesh.visible || duck.state !== 'flying' || round.hit.has(i) || !enabled || cameraBlend < 0.99;
        if (button.hidden !== hidden) button.hidden = hidden;
        if (button.hidden) return;
        point.copy(mesh.position).project(camera);
        if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z < -1 || point.z > 1) { button.hidden = true; return; }
        // The hit area covers the body and wing span, never smaller than a finger.
        edge.set(mesh.position.x + DUCK_W / 2 * duck.scale, mesh.position.y + DUCK_H / 2 * duck.scale, mesh.position.z).project(camera);
        const width = Math.max(36, Math.abs(edge.x - point.x) * canvasWidth);
        const height = Math.max(36, Math.abs(edge.y - point.y) * canvasHeight);
        button.style.width = `${width}px`;
        button.style.height = `${height}px`;
        button.style.left = `${((point.x + 1) * canvasWidth) / 2 - width / 2}px`;
        button.style.top = `${((1 - point.y) * canvasHeight) / 2 - height / 2}px`;
      });
    },
  };
}
