import * as THREE from "three";
import {ROAD_HALF, type Track, type VehicleState} from "./core";

const CAPACITY = 640, WIDTH = 0.24;
/** Two rear-tire trails, one draw call and a fixed memory budget. */
export class TireMarks {
  readonly mesh: THREE.Mesh;
  private positions = new THREE.BufferAttribute(new Float32Array(CAPACITY * 2 * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  private births = new THREE.BufferAttribute(new Float32Array(CAPACITY * 2 * 4), 1).setUsage(THREE.DynamicDrawUsage);
  private clock = {value: 0};
  private previous?: THREE.Vector3[];
  private cursor = 0;
  private count = 0;
  constructor(private track: Track) {
    const geometry = new THREE.BufferGeometry(), uv: number[] = [], indices: number[] = [];
    geometry.setAttribute("position", this.positions);
    geometry.setAttribute("markBirth", this.births);
    for (let i = 0; i < CAPACITY * 2; i++) {
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      const k = i * 4; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.setDrawRange(0, 0);
    const material = new THREE.MeshBasicMaterial({
      color: "#080a12", transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    material.onBeforeCompile = shader => {
      shader.uniforms.markTime = this.clock;
      shader.vertexShader = "attribute float markBirth; varying float vMarkBirth; varying vec2 vMarkUv;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvMarkBirth = markBirth; vMarkUv = uv;");
      shader.fragmentShader = "uniform float markTime; varying float vMarkBirth; varying vec2 vMarkUv;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `
        diffuseColor.a *= (1.0 - smoothstep(30.0, 48.0, markTime - vMarkBirth));
        diffuseColor.a *= smoothstep(0.0, 0.15, vMarkUv.x) * smoothstep(0.0, 0.15, 1.0 - vMarkUv.x);
        diffuseColor.a *= 0.85 + 0.15 * sin(vMarkUv.x * 95.0);
        #include <alphatest_fragment>
      `);
    };
    material.customProgramCacheKey = () => "fluid-tire-marks-v1";
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "drift-tire-marks";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }
  clear() {
    this.previous = undefined; this.cursor = 0; this.count = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
  breakTrail() { this.previous = undefined; }
  private surface(point: THREE.Vector3, index: number) {
    let nearest = Infinity, height = 0;
    for (let offset = -4; offset <= 4; offset++) {
      const i = (index + offset + this.track.samples.length) % this.track.samples.length;
      const a = this.track.samples[i].p, b = this.track.samples[(i + 1) % this.track.samples.length].p;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
      const distance = Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
      if (distance < nearest) { nearest = distance; height = a.y + (b.y - a.y) * t; }
    }
    point.y = height + 0.012;
    return nearest < ROAD_HALF - WIDTH;
  }
  update(dt: number, state: VehicleState, wheels: THREE.Vector3[], active: boolean) {
    this.clock.value += Math.min(dt, 0.1);
    if (!active || !state.driftDirection || state.speed < 8 || wheels.length !== 2) { this.breakTrail(); return; }
    const points = wheels.map(p => p.clone());
    if (!points.every(p => this.surface(p, state.contact.index))) { this.breakTrail(); return; }
    if (!this.previous) { this.previous = points; return; }
    const distance = Math.max(...points.map((p, i) => p.distanceTo(this.previous![i])));
    if (distance < 0.32) return;
    if (distance > 5) { this.previous = points; return; }
    for (let tire = 0; tire < 2; tire++) {
      const a = this.previous[tire], b = points[tire];
      const normal = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(WIDTH / 2);
      const vertices = [a.clone().sub(normal), a.clone().add(normal), b.clone().sub(normal), b.clone().add(normal)];
      for (let v = 0; v < 4; v++) {
        this.surface(vertices[v], state.contact.index);
        const i = (this.cursor * 2 + tire) * 4 + v;
        this.positions.setXYZ(i, vertices[v].x, vertices[v].y, vertices[v].z);
        this.births.setX(i, this.clock.value);
      }
    }
    this.cursor = (this.cursor + 1) % CAPACITY;
    this.count = Math.min(CAPACITY, this.count + 1);
    this.positions.needsUpdate = true; this.births.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.count * 12);
    this.previous = points;
  }
}
