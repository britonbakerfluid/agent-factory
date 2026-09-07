import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ArcadeController,
  RunTimer,
  TUNING,
  STEP,
  WORLD_SCALE,
  RECORD_KEY,
  validRecords,
  addRecord,
  bestFor,
  ranked,
  formatTime,
  type CarId,
  type Mode,
  type RecordRun,
} from "./core";
import { createWorld, type RaceWorld } from "./world";
import { RaceInput } from "./input";
import { CarAudio } from "./audio";
import {clearCamera} from "./camera-ground";
import { createHud, type HudState } from "./hud";
import "./game.css";
import "./factory-dock.css";
import type { DrivingInput, VehicleState, Track } from "./core";
export interface GarageBridge {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  cars: Map<CarId, { root: THREE.Group }>;
  selected: () => CarId | "room";
  setControls: (enabled: boolean) => void;
  boardCanvas: HTMLCanvasElement;
  boardTexture: THREE.CanvasTexture;
  boardObject: THREE.Object3D;
  garageCamera: THREE.Camera;
  depart: (car: CarId) => Promise<void>;
  restoreGarage: () => void;
  garageExterior: () => THREE.Group;
  addWindowRoad: (road: THREE.Group, track: Track) => void;
}
function optimizeCar(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const staticMeshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let moving = false;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent)
      if (p.userData.role === "wheel" || p.userData.role === "steering")
        moving = true;
    if (!moving && !Array.isArray(o.material) && !o.material.transparent)
      staticMeshes.push(o);
  });
  const inverse = root.matrixWorld.clone().invert(),
    byMaterial = new Map<
      string,
      { material: THREE.Material; geometries: THREE.BufferGeometry[] }
    >();
  for (const m of staticMeshes) {
    const material = m.material as THREE.Material;
    const g = m.geometry
      .clone()
      .applyMatrix4(inverse.clone().multiply(m.matrixWorld));
    const key =
      material.uuid +
      ":" +
      Object.keys(g.attributes).sort().join(",") +
      ":" +
      !!g.index;
    const entry = byMaterial.get(key) ?? { material, geometries: [] };
    entry.geometries.push(g);
    byMaterial.set(key, entry);
    m.removeFromParent();
  }
  for (const { material, geometries: gs } of byMaterial.values()) {
    const merged = mergeGeometries(gs);
    if (merged) {
      const m = new THREE.Mesh(merged, material);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    } else for (const g of gs) root.add(new THREE.Mesh(g, material));
    if (merged) gs.forEach((g) => g.dispose());
  }
}
export class MountainGame {
  mode: Mode = "garage";
  world?: RaceWorld;
  worldPromise?: Promise<RaceWorld>;
  controller?: ArcadeController;
  run?: RunTimer;
  car?: THREE.Group;
  carId: CarId = "porsche";
  input: RaceInput;
  audio = new CarAudio();
  hud: ReturnType<typeof createHud>;
  departureTime=0;
  departurePath?:THREE.CatmullRomCurve3;
  exterior?:THREE.Group;
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1800);
  testDrive =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("drivecheck") === "1";
  testDrift = this.testDrive && new URLSearchParams(location.search).get("driftcheck") === "1";
  testInput?: (s: VehicleState, t: Track) => DrivingInput;
  recordKey = RECORD_KEY + (this.testDrive ? ".test" : "");
  frameAverage = 1 / 60;
  records: RecordRun[] = [];
  storageAvailable = true;
  countdown = 3;
  accumulator = 0;
  previousMode: Mode = "racing";
  board = false;
  notice = "";
  noticeUntil = 0;
  previousBest?: number;
  result?: number;
  loadingError = false;
  lastHud = 0;
  lastBeep = 4;
  loadGeneration = 0;
  quality = 1;
  slowFrames = 0;
  lastSelection: CarId | "room" = "room";
  wheels: THREE.Object3D[] = [];
  steering: THREE.Object3D[] = [];
  ownedGeometry: THREE.BufferGeometry[] = [];
  look = new THREE.Vector3();
  constructor(public bridge: GarageBridge) {
    try {
      this.records = validRecords(localStorage.getItem(this.recordKey));
    } catch {
      this.storageAvailable = false;
    }
    this.input = new RaceInput(
      () => this.pause(),
      () => this.reset(),
    );
    this.hud = createHud({
      drive: () => void this.start(),
      retry: () => void this.start(this.carId),
      garage: () => this.garage(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      reset: () => this.reset(),
      mute: () => {
        void this.audio.start().catch(() => {});
        this.audio.toggle();
        this.renderHud();
      },
      board: (open) => {
        this.board = open;
        this.bridge.setControls(!open);
        this.renderHud();
      },
      input: this.input,
    });
    this.drawBoard();
    this.renderHud();
    // The same road is also rendered through the garage window once ready.
    void this.ensureWorld().catch(() => {});
    bridge.canvas.addEventListener("pointerdown", this.boardStart);
    bridge.canvas.addEventListener("pointerup", this.boardClick);
    addEventListener("pagehide", this.dispose);
  }
  boardOrigin = { x: 0, y: 0 };
  boardStart = (event: PointerEvent) => {
    this.boardOrigin = { x: event.clientX, y: event.clientY };
  };
  boardClick = (event: PointerEvent) => {
    if (
      this.mode !== "garage" ||
      this.board ||
      Math.hypot(
        event.clientX - this.boardOrigin.x,
        event.clientY - this.boardOrigin.y,
      ) > 6
    )
      return;
    const rect = this.bridge.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.bridge.garageCamera,
    );
    if (ray.intersectObject(this.bridge.boardObject, true).length) {
      this.board = true;
      this.bridge.setControls(false);
      this.renderHud();
    }
  };
  async ensureWorld() {
    if (this.world) return this.world;
    if (!this.worldPromise)
      this.worldPromise = createWorld()
        .then((world) => {
          this.world = world;
          const copy = world.road.clone(true);
          copy.scale.setScalar(1 / WORLD_SCALE);
          this.bridge.addWindowRoad(copy, world.track);
          return world;
        })
        .catch((error) => {
          this.worldPromise = undefined;
          throw error;
        });
    return this.worldPromise;
  }
  setMode(mode: Mode) {
    const previous = this.mode;
    this.mode = mode;
    document.body.classList.toggle("race-active", mode !== "garage");
    this.bridge.setControls(mode === "garage" && !this.board);
    if(mode !== "racing") this.controller?.cancelDrift();
    this.input.enabled = mode === "racing" || mode === "countdown";
    if (!(previous === "countdown" && mode === "racing")) this.input.clear();
    this.bridge.canvas.setAttribute(
      "aria-label",
      mode === "garage"
        ? "Fluid Factory garage. Choose a car to inspect or race."
        : "Mountain time trial. Use WASD or arrows to drive, R to reset, Escape to pause.",
    );
    this.renderHud();
  }
  async start(id?: CarId) {
    const selected = id ?? this.bridge.selected();
    if (selected === "room" || !this.bridge.cars.has(selected)) return;
    const generation = ++this.loadGeneration;
    this.carId = selected;
    this.board = false;
    this.loadingError = false;
    this.notice = "";
    this.result = undefined;
    this.previousBest = bestFor(this.records, selected);
    this.setMode("loading");
    void this.audio
      .start()
      .catch(() => this.tell("sound is unavailable in this browser."));
    try {
      const world = await this.ensureWorld();
      if (this.testDrive) {
        const check = await import("./drive-check");
        this.testInput = this.testDrift
          ? check.createDriftCheckInput() : check.scriptedInput;
      }
      if (generation !== this.loadGeneration) return;
      this.removeCar();
      this.car = new THREE.Group();
      const source = this.bridge.cars.get(selected)!.root;
      for (const child of source.children) {
        const clone = child.clone(true);
        this.car.add(clone);
      }
      this.car.traverse((o) => {
        if (o.userData.role === "door") o.rotation.z = 0;
        if (o.userData.role === "wheel") o.rotation.x = 0;
        if (o.userData.role === "steering") o.rotation.y = 0;
      });
      const originalGeometries = new Set<THREE.BufferGeometry>();
      this.car.traverse((o) => {
        if (o instanceof THREE.Mesh) originalGeometries.add(o.geometry);
      });
      optimizeCar(this.car);
      this.ownedGeometry = [];
      this.car.traverse((o) => {
        if (o instanceof THREE.Mesh && !originalGeometries.has(o.geometry))
          this.ownedGeometry.push(o.geometry);
      });
      this.car.scale.setScalar(1.65);
      world.scene.add(this.car);
      this.wheels = [];
      this.steering = [];
      this.car.traverse((o) => {
        if (o.userData.role === "wheel") this.wheels.push(o);
        if (o.userData.role === "steering") this.steering.push(o);
      });
      this.controller = new ArcadeController(world.track, TUNING[selected]);
      this.run = new RunTimer(world.track);
      this.countdown = 3;
      this.accumulator = 0;
      this.lastBeep = 4;
      this.syncCar(0);
      this.updateCamera(1, true);
      if(new URLSearchParams(location.search).has('factoryCar')) {
        this.setMode('countdown');return;
      }
      this.setMode("boarding");
      await this.bridge.depart(selected);
      if(generation !== this.loadGeneration) return;
      this.setupExterior();
      this.departureTime=0;
      this.setMode("departing");
      if (document.hidden || !document.hasFocus()) this.pause();
    } catch {
      if (generation !== this.loadGeneration) return;
      this.loadingError = true;
      this.renderHud();
    }
  }
  setupExterior(){
    if(!this.world||!this.controller)return;
    this.exterior?.removeFromParent();
    this.world.scene.getObjectByName("factory-landmark")?.removeFromParent();
    const start=this.world.track.samples[0],exit=start.right.clone().negate();
    const door=start.p.clone().addScaledVector(start.right,17).addScaledVector(start.tangent,-12);
    const shell=this.bridge.garageExterior();
    const rotation=Math.atan2(exit.x,exit.z)-Math.PI;
    shell.scale.setScalar(1.65);shell.rotation.y=rotation;
    const localDoor=new THREE.Vector3(-5.25,0,-6).multiplyScalar(1.65).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
    shell.position.copy(door).sub(localDoor);this.world.scene.add(shell);this.exterior=shell;
    this.departurePath=new THREE.CatmullRomCurve3([door,door.clone().addScaledVector(exit,5),start.p.clone().addScaledVector(start.tangent,-5),start.p.clone()],false,'centripetal');
    const positions:number[]=[],indices:number[]=[];
    for(let i=0;i<=40;i++) {const p=this.departurePath.getPoint(i),t=this.departurePath.getTangent(i),r=new THREE.Vector3(t.z,0,-t.x).normalize();for(const side of [-1,1])positions.push(p.x+r.x*3*side,p.y-.03,p.z+r.z*3*side);if(i<40){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
    const apron=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#535b60',roughness:1,side:THREE.DoubleSide}));
    // Own only this apron; the garage clone shares its source meshes.
    this.world.scene.getObjectByName('garage-apron')?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
    this.world.scene.getObjectByName('garage-apron')?.removeFromParent();apron.name='garage-apron';this.world.scene.add(apron);
    this.controller.state.position.copy(door);this.controller.state.heading=Math.atan2(exit.x,exit.z);
    this.syncCar(0);this.updateCamera(1,true);
  }
  removeCar() {
    this.world?.tireMarks.clear();
    this.car?.removeFromParent();
    this.ownedGeometry.forEach((g) => g.dispose());
    this.ownedGeometry = [];
    this.controller?.dispose();
    this.car = undefined;
    this.controller = undefined;
    this.wheels = [];
    this.steering = [];
  }
  garage() {
    if(new URLSearchParams(location.search).has('factoryCar')) parent.postMessage({type:'fluid-garage-return'},location.origin);
    this.loadGeneration++;
    this.bridge.restoreGarage();
    this.audio.update(0, 0, false);
    this.removeCar();
    this.run = undefined;
    this.board = false;
    this.setMode("garage");
    dispatchEvent(new Event("resize"));
    this.drawBoard();
  }
  pause() {
    if (this.mode !== "racing" && this.mode !== "countdown") return;
    this.previousMode = this.mode;
    this.setMode("paused");
    this.audio.update(0, 0, false);
  }
  resume() {
    if (this.mode !== "paused") return;
    this.accumulator = 0;
    this.setMode(this.previousMode);
    void this.audio.start().catch(() => {});
  }
  reset() {
    if (this.mode !== "racing" || !this.run || !this.controller) return;
    this.world?.tireMarks.breakTrail();
    this.controller.reset(this.run.reset());
    this.input.clear();
    this.syncCar(0);
    this.updateCamera(1, true);
    this.tell("back on the road · +2 seconds");
  }
  tell(message: string) {
    this.notice = message;
    this.noticeUntil = performance.now() + 6000;
    this.renderHud();
  }
  finish() {
    if (!this.run) return;
    this.result = Math.round(this.run.total * 1000);
    this.records = addRecord(this.records, {
      car: this.carId,
      ms: this.result,
      date: new Date().toISOString(),
    });
    try {
      localStorage.setItem(this.recordKey, JSON.stringify(this.records));
    } catch {
      this.storageAvailable = false;
      this.tell("your time is shown here, but this browser couldn’t save it.");
    }
    this.drawBoard();
    this.setMode("results");
    this.audio.update(0, 0, false);
    this.audio.beep(880, 0.5);
  }
  syncCar(dt: number) {
    if (!this.car || !this.controller) return;
    const s = this.controller.state;
    this.car.position.copy(s.position).y += 0.04;
    const normal = new THREE.Vector3()
      .crossVectors(s.contact.tangent, s.contact.right)
      .normalize();
    const forward = new THREE.Vector3(
      Math.sin(s.heading),
      0,
      Math.cos(s.heading),
    );
    forward.addScaledVector(normal, -forward.dot(normal)).normalize();
    const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
    const target = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, forward),
    );
    target.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -s.steer * Math.min(0.06, s.speed * 0.002),
      ),
    );
    this.car.quaternion.slerp(target, dt ? 1 - Math.exp(-12 * dt) : 1);
    const sign = Math.sign(s.velocity.dot(forward));
    this.wheels.forEach(
      (w) =>
        (w.rotation.x +=
          (s.speed * sign * dt) / (Number(w.userData.radius || 0.25) * 1.65)),
    );
    this.steering.forEach((w) => (w.rotation.y = s.steer * 0.4));
  }
  updateCamera(dt: number, snap = false) {
    if (!this.controller || !this.world) return;
    const s = this.controller.state,
      forward = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
    const distance = innerWidth < innerHeight ? 31 : 26;
    const target = s.position
      .clone()
      .addScaledVector(forward, 7)
      .add(new THREE.Vector3(0, 1.35, 0));
    const desired = s.position
      .clone()
      .addScaledVector(forward, -distance)
      .add(new THREE.Vector3(0, 19, 0));
    desired.y = Math.max(
      desired.y,
      this.world.track.heightAt(desired.x, desired.z) + 2.8,
    );
    for (let i = 1; i < 6; i++) {
      const t = i / 6,
        p = target.clone().lerp(desired, t);
      const ground = this.world.track.heightAt(p.x, p.z) + 1.2;
      if (p.y < ground) desired.y += (ground - p.y) / t;
    }
    this.camera.position.lerp(desired, snap ? 1 : 1 - Math.exp(-6 * dt));
    this.look.lerp(target, snap ? 1 : 1 - Math.exp(-8 * dt));
    clearCamera(this.world.track,this.camera.position,this.look);
    this.camera.lookAt(this.look);
    const targetFov = 50 + 2 * Math.min(1, s.speed / this.controller.tuning.maxSpeed);
    this.camera.fov += (targetFov - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-3 * dt));
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  frame(dt: number, now: number) {
    if (this.notice && now > this.noticeUntil) {
      this.notice = "";
      this.renderHud();
    }
    if(this.mode === "boarding") return false;
    if(this.mode === "departing" && this.controller && this.departurePath){
      this.departureTime+=document.hidden?0:Math.min(dt,.05);
      const t=Math.min(1,this.departureTime/2.8),p=this.departurePath.getPointAt(t),forward=this.departurePath.getTangentAt(t);
      const state=this.controller.state;state.position.copy(p);state.heading=Math.atan2(forward.x,forward.z);state.speed=7;
      this.syncCar(dt);this.updateCamera(dt);
      if(t===1){this.controller.reset(this.world!.track.samples[0]);this.setMode('countdown');}
    }
    if (this.mode === "garage") {
      if (this.lastSelection !== this.bridge.selected()) {
        this.lastSelection = this.bridge.selected();
        this.renderHud();
      }
      return false;
    }
    if (dt > 0.25 && this.mode === "countdown" && this.countdown > 2.9) dt = 0;
    if (dt > 0.25 && (this.mode === "racing" || this.mode === "countdown")) {
      this.pause();
      this.tell("paused after an interruption · resume when you’re ready.");
    }
    if (
      (this.mode === "racing" || this.mode === "countdown") &&
      this.controller &&
      this.run
    ) {
      this.accumulator += dt;
      while (this.accumulator >= STEP) {
        this.accumulator -= STEP;
        if (this.mode === "countdown") {
          const beep = Math.ceil(this.countdown);
          if (beep < this.lastBeep) {
            this.audio.beep(440);
            this.lastBeep = beep;
          }
          this.countdown -= STEP;
          if (this.countdown <= 0) {
            this.setMode("racing");
            this.audio.beep(880, 0.25);
          }
        } else {
          const previous = this.controller.state.position.clone();
          this.controller.step(
            this.testInput
              ? this.testInput(this.controller.state, this.world!.track)
              : this.input.read(),
            STEP,
          );
          this.run.step(previous, this.controller.state.position, STEP);
          if (
            this.controller.state.contact.distance > 12 ||
            !Number.isFinite(this.controller.state.position.y)
          )
            this.reset();
          if (this.run.finished) {
            this.finish();
            break;
          }
        }
      }
      this.syncCar(dt);
      this.updateCamera(dt);
    }
    if (this.world && this.controller) {
      this.car?.updateMatrixWorld(true);
      const rearWheels = this.steering.filter(w => w.userData.axle === "rear")
        .map(w => w.getWorldPosition(new THREE.Vector3()));
      this.world.tireMarks.update(dt, this.controller.state, rearWheels, this.mode === "racing");
      const targetWidth = this.input.touchMode ? 800 : 960,
        ratio = Math.min(1, targetWidth / innerWidth) * this.quality;
      const width = Math.round(innerWidth * ratio),
        height = Math.round(innerHeight * ratio);
      if (
        this.bridge.canvas.width !== width ||
        this.bridge.canvas.height !== height
      )
        this.bridge.renderer.setSize(width, height, false);
      if (this.mode === "racing" && dt > 0.037) this.slowFrames++;
      else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (this.slowFrames > 90 && this.quality > 0.6) {
        this.quality = Math.max(0.6, this.quality - 0.15);
        this.slowFrames = 0;
      }
      this.bridge.renderer.render(this.world.scene, this.camera);
      this.audio.update(
        this.controller.state.speed,
        this.controller.state.slip,
        this.mode === "racing",
      );
    }
    if (now - this.lastHud > 80) {
      this.lastHud = now;
      this.renderHud();
    }
    if (dt > 0 && dt < 0.25 && this.mode === "racing")
      this.frameAverage += (dt - this.frameAverage) * 0.03;
    this.bridge.canvas.dataset.fps = String(Math.round(1 / this.frameAverage));
    this.bridge.canvas.dataset.drawCalls = String(
      this.bridge.renderer.info.render.calls,
    );
    this.bridge.canvas.dataset.mode = this.mode;
    this.bridge.canvas.dataset.raceCar = this.carId;
    return true;
  }
  renderHud() {
    const s = this.controller?.state;
    const snapshot: HudState = {
      mode: this.mode,
      car: this.mode === "garage" ? this.bridge.selected() : this.carId,
      time: this.run?.total ?? 0,
      speed: s?.speed ?? 0,
      driftCharge: s?.driftCharge ?? 0,
      drifting: !!s?.driftDirection,
      boost: s?.boost ?? 0,
      countdown: this.countdown,
      gate: this.run ? this.run.nextGate - 1 : 0,
      wrongWay: !!s && s.speed > 2 && s.velocity.dot(s.contact.tangent) < -1,
      muted: this.audio.muted,
      records: this.records,
      board: this.board,
      notice:
        this.notice ||
        (this.testDrive
          ? this.testDrift ? "tire-mark preview · short drift every 8 seconds · test records" : "scripted driving check · separate test records"
          : !this.storageAvailable
            ? "records stay in this session because browser storage is unavailable."
            : ""),
      previousBest: this.previousBest,
      result: this.result,
      touch: this.input.touchMode,
      loadingError: this.loadingError,
    };
    this.hud.render(snapshot);
  }
  drawBoard() {
    const c = this.bridge.boardCanvas;
    c.width = 960;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#344f59";
    ctx.font = "30px GeistPixel,monospace";
    ctx.fillText("MOUNTAIN LOOP / PERSONAL BESTS", 35, 48);
    ctx.font = "21px GeistPixel,monospace";
    ctx.fillText("OVERALL", 35, 100);
    ctx.fillText("BY CAR", 510, 100);
    ctx.font = "24px GeistPixel,monospace";
    const top = ranked(this.records);
    if (!top.length) {
      ctx.fillText("your first lap", 35, 155);
      ctx.fillText("starts here.", 35, 191);
    }
    top.forEach((r, i) => {
      ctx.fillText(`${i + 1} ${TUNING[r.car].name}`, 35, 151 + i * 52);
      ctx.fillText(formatTime(r.ms), 270, 151 + i * 52);
    });
    (Object.keys(TUNING) as CarId[]).forEach((car, i) => {
      ctx.fillText(TUNING[car].name, 510, 151 + i * 64);
      const best = bestFor(this.records, car);
      ctx.fillText(
        best === undefined ? "—" : formatTime(best),
        750,
        151 + i * 64,
      );
    });
    ctx.font = "19px GeistPixel,monospace";
    ctx.fillText("one road. four cars. your time to beat.", 35, 462);
    this.bridge.boardTexture.needsUpdate = true;
  }
  dispose = () => {
    this.input.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.bridge.canvas.removeEventListener("pointerdown", this.boardStart);
    this.bridge.canvas.removeEventListener("pointerup", this.boardClick);
    removeEventListener("pagehide", this.dispose);
    this.removeCar();
    this.world?.dispose();
  };
}
