import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createTerrainSampler } from "../reference/factory25dTerrainSampler";
import { createTrack, ROAD_HALF, WORLD_SCALE, type Track } from "./core";
import {roadPaintMaterial} from "./road-paint";
import {createRoadGround} from "./road-ground";
import {sculptRoadBed} from "./sculpt-road-bed";
import {TireMarks} from "./tire-marks";
import {createHorizon} from "./scenery-horizon";
const mat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1 });
export interface RaceWorld {
  scene: THREE.Scene;
  road: THREE.Group;
  track: Track;
  tireMarks: TireMarks;
  dispose: () => void;
}
function ribbon(
  track: Track,
  left: number,
  right: number,
  offset: number,
  material: THREE.Material,
) {
  const v: number[] = [],
    indices: number[] = [], roadCoords:number[]=[];
  for (let i = 0; i <= track.samples.length; i++) {
    const s = track.samples[i % track.samples.length];
    for (const side of [left, right]) {
      roadCoords.push(side,i===track.samples.length?track.length:s.distance);
      v.push(
        s.p.x + s.right.x * side,
        s.p.y + offset,
        s.p.z + s.right.z * side,
      );
    }
    if (i < track.samples.length) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  geo.setAttribute("roadCoord",new THREE.Float32BufferAttribute(roadCoords,2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}
function box(
  group: THREE.Group,
  size: number[],
  position: THREE.Vector3,
  material: THREE.Material,
) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(...(size as [number, number, number])),
    material,
  );
  m.position.copy(position);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
export function makeRoad(track: Track) {
  const root = new THREE.Group();
  root.name = "mountain_test_loop";
  const asphalt = roadPaintMaterial(track.length),
    shoulder = mat("#8d8670"), white=mat("#c8c8b8");
  // Adjacent strips avoid near-coplanar overlap and flicker at a distance.
  root.add(ribbon(track, -ROAD_HALF - 1.1, -ROAD_HALF, -0.025, shoulder));
  root.add(ribbon(track, ROAD_HALF, ROAD_HALF + 1.1, -0.025, shoulder));
  asphalt.polygonOffset = true; asphalt.polygonOffsetFactor = -1; asphalt.polygonOffsetUnits = -1;
  root.add(ribbon(track, -ROAD_HALF, ROAD_HALF, 0, asphalt));
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
  const railMat = mat("#626c80");
  for (const side of [-1, 1]) {
    const rails = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.24, 1),
      railMat,
      track.samples.length,
    );
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 1.05, 0.13),
      railMat,
      Math.ceil(track.samples.length / 4),
    );
    for (let i = 0; i < track.samples.length; i++) {
      const s = track.samples[i],
        n = track.samples[(i + 1) % track.samples.length];
      // Leave the garage driveway junction open on the outside of the start.
      if(side===1 && (s.distance<8 || s.distance>track.length-22)) {
        matrix.makeScale(0,0,0);rails.setMatrixAt(i,matrix);
        if(i%4===0)posts.setMatrixAt(i/4,matrix);
        continue;
      }
      const a = s.p.clone().addScaledVector(s.right, side * (ROAD_HALF + 1.25)),
        b = n.p.clone().addScaledVector(n.right, side * (ROAD_HALF + 1.25));
      const d = b.clone().sub(a);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize());
      matrix.compose(
        a
          .clone()
          .lerp(b, 0.5)
          .add(new THREE.Vector3(0, 0.8, 0)),
        q,
        new THREE.Vector3(1, 1, d.length() + 0.05),
      );
      rails.setMatrixAt(i, matrix);
      if (i % 4 === 0) {
        matrix.compose(
          a.clone().add(new THREE.Vector3(0, 0.48, 0)),
          new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1),
        );
        posts.setMatrixAt(i / 4, matrix);
      }
    }
    rails.castShadow = false;
    root.add(rails, posts);
  }
  const gateMat = mat("#ddc995"),
    dark = mat("#39424c");
  track.gates.forEach((s, i) => {
    const group = new THREE.Group();
    group.position.copy(s.p);
    group.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    for (const side of [-1, 1]) {
      box(
        group,
        [0.16, i === 0 ? 7.5 : 3.4, 0.16],
        new THREE.Vector3(side * (ROAD_HALF + 0.55), i === 0 ? 3.75 : 1.7, 0),
        dark,
      );
      box(
        group,
        [0.55, 0.55, 0.1],
        new THREE.Vector3(side * (ROAD_HALF + 0.55), 3.15, 0),
        gateMat,
      );
    }
    if (i === 0) {
      box(
        group,
        [ROAD_HALF * 2 + 1.3, 0.65, 0.18],
        new THREE.Vector3(0, 7.5, 0),
        dark,
      );
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 64;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#d8cbaa";
      cx.font = "26px GeistPixel,monospace";
      cx.textAlign = "center";
      cx.fillText("FLUID • MOUNTAIN LOOP", 256, 43);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 0.6),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      sign.position.set(0, 7.5, -0.12);
      sign.rotation.y = Math.PI;
      group.add(sign);
      for (let x = 0; x < 16; x++)
        for (let z = 0; z < 2; z++)
          box(
            group,
            [ROAD_HALF / 8, 0.018, 0.5],
            new THREE.Vector3(
              -ROAD_HALF + ((x + 0.5) * ROAD_HALF) / 8,
              0.025,
              z * 0.5 - 0.25,
            ),
            (x + z) % 2 ? white : dark,
          );
    }
    root.add(group);
  });
  return root;
}
export async function createWorld(): Promise<RaceWorld> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8299bd");
  scene.fog = new THREE.Fog("#8299bd", 330, 1000);
  const hemi = new THREE.HemisphereLight("#9bb6df", "#363453", 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffe0b3", 1.6);
  sun.position.set(-90, 160, 70);
  scene.add(sun);
  const loaded = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+"models/utah-mountains.glb");
  loaded.scene.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  loaded.scene.traverse((o) => {
    if (o instanceof THREE.Mesh)
      geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  if (!geometries.length) throw new Error("Mountain terrain unavailable");
  const geo = mergeGeometries(
    geometries.map((g) => {
      const p = new THREE.BufferGeometry();
      p.setAttribute("position", g.getAttribute("position").clone());
      p.setIndex(g.index?.clone() ?? null);
      return p;
    }),
  );
  if (!geo) throw new Error("Mountain geometry unavailable");
  const sample = createTerrainSampler(geo, () => -0.6);
  const heightAt = (x: number, z: number) =>
    sample(x / WORLD_SCALE, z / WORLD_SCALE) * WORLD_SCALE;
  const track = createTrack(heightAt), graded = createRoadGround(track);
  // Preserve the Blender paint; refine only the road corridor before cut/fill.
  loaded.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const toWorld = new THREE.Matrix4().makeScale(WORLD_SCALE, WORLD_SCALE, WORLD_SCALE).multiply(o.matrixWorld);
    const original = o.geometry;
    o.geometry = sculptRoadBed(original, toWorld, graded);
    original.dispose();
  });
  track.heightAt = graded.heightAt;
  loaded.scene.scale.setScalar(WORLD_SCALE);
  loaded.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.receiveShadow = true;
      o.castShadow = false;
      const colors=o.geometry.getAttribute('color');
      if(colors){const color=new THREE.Color(),hsl={h:0,s:0,l:0};for(let i=0;i<colors.count;i++){color.fromBufferAttribute(colors,i).getHSL(hsl);color.setHSL(hsl.h,Math.min(1,hsl.s*1.22),hsl.l*.9);colors.setXYZ(i,color.r,color.g,color.b);}colors.needsUpdate=true;}

    }
  });
  scene.add(loaded.scene);
  const road = makeRoad(track);
  const tireMarks = new TireMarks(track);
  scene.add(road, tireMarks.mesh, createHorizon());
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3500, 3500),
    mat("#536d4a"),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -15;
  scene.add(ground);
  // The factory landmark sits beside the real start/finish, visible on approach.
  const factory = new THREE.Group(),
    s = track.samples[0];
  factory.name="factory-landmark";
  factory.position.copy(s.p).addScaledVector(s.right, 19);
  factory.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
  const wall = mat("#68716e"),
    trim = mat("#344754"),
    glass = new THREE.MeshStandardMaterial({
      color: "#577789",
      roughness: 0.35,
      metalness: 0.2,
    });
  box(factory, [17, 5, 11], new THREE.Vector3(0, 2.3, 0), wall);
  box(factory, [18, 0.4, 12], new THREE.Vector3(0, 5, 0), trim);
  for (let x = -6; x <= 6; x += 3)
    box(factory, [2.4, 2.5, 0.08], new THREE.Vector3(x, 2.7, 5.56), glass);
  box(factory, [4.2, 3.3, 0.1], new THREE.Vector3(0, 1.65, -5.56), trim);
  scene.add(factory);
  const trees = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.5, 5, 5),
      mat("#496b58"),
      100,
    ),
    matrix = new THREE.Matrix4();
  for (let i = 0; i < 100; i++) {
    const s = track.samples[(i * 37) % track.samples.length],
      side = i % 2 ? 1 : -1,
      offset = 12 + (i % 5) * 4;
    const x = s.p.x + s.right.x * side * offset,
      z = s.p.z + s.right.z * side * offset;
    matrix.makeTranslation(x, track.heightAt(x, z) + 2.1, z);
    trees.setMatrixAt(i, matrix);
  }
  scene.add(trees);
  geometries.forEach((g) => g.dispose());
  geo.dispose();
  return {
    scene,
    road,
    track,
    tireMarks,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            if ("map" in m && m.map instanceof THREE.Texture)
              textures.add(m.map);
          }
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
