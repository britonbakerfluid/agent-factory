import * as THREE from 'three';
import { GARAGE_FIRE_LIFETIME_MS, GARAGE_MAX_MARKS, type GarageTimeJump, type GarageTireMark } from '@shared/factory25d-driving';
import { GARAGE_CAR_BAYS, garageRampHeightAt } from '@shared/factory25d-garage';

/** Bounded, server-timed fire trails. Reconnection never starts an old flash again. */
export function createGarageTimeJump(room: THREE.Group) {
  const capacity = GARAGE_MAX_MARKS * 2;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const born = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  geometry.setAttribute('fireBorn', born);
  const nowUniform = { value: 0 }, motion = { value: 1 };
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, uniforms: { fireNow: nowUniform, motion },
    vertexShader: `attribute float fireBorn; uniform float fireNow; uniform float motion;
      varying vec2 vUv; varying float age; varying float seed;
      void main(){vUv=uv;age=fireNow-fireBorn;seed=fireBorn*7.13+instanceMatrix[3].x*8.7;
        vec3 p=position;float tick=floor(fireNow*12.0)/12.0;
        p.y+=(.07*sin(tick*11.0+seed)+.04*sin(tick*17.0+seed))*uv.y*motion;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.0);}`,
    fragmentShader: `uniform float fireNow; uniform float motion;
      varying vec2 vUv; varying float age; varying float seed;
      void main(){float life=(1.0-smoothstep(3.0,8.0,age))*step(0.0,age);
        float tick=floor(fireNow*12.0)/12.0;
        float sway=sin(vUv.y*8.0-tick*8.0+seed)*.07*vUv.y*motion;
        float edge=abs(vUv.x-.5+sway)*2.0;
        float shape=pow(1.0-vUv.y,.7);
        float a=(1.0-smoothstep(shape*.55,shape,edge))*smoothstep(0.0,.08,vUv.y)*(1.0-smoothstep(.65,1.0,vUv.y))*life;
        vec3 color=mix(vec3(1.0,.12,.015),vec3(1.0,.8,.2),(1.0-vUv.y)*(1.0-edge));
        gl_FragColor=vec4(color,a*.85);}`,
  });
  const flames = new THREE.InstancedMesh(geometry, material, capacity);
  flames.name = 'delorean-fire-trails'; flames.count = 0; flames.frustumCulled = false; flames.renderOrder = 2;
  flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage); born.setUsage(THREE.DynamicDrawUsage); room.add(flames);
  const flashMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform float strength; void main(){float r=length(vUv-.5)*2.0;gl_FragColor=vec4(.55,.85,1.0,(1.0-smoothstep(.05,1.0,r))*strength);}',
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), flashMaterial);
  flash.name = 'delorean-arrival-flash'; flash.visible = false; flash.renderOrder = 3; room.add(flash);
  const light = new THREE.PointLight('#ffb74c', 0, 5, 2); light.name = 'delorean-fire-light'; room.add(light);
  const pose = new THREE.Object3D(), tracks = new Map<number, GarageTireMark>(), jumps = new Map<number, GarageTimeJump>();
  let origin: number | undefined, dirty = false, lastNow = 0;
  function ingest(marks: readonly GarageTireMark[]) {
    for (const mark of marks) if (mark.kind === 'fire' && !tracks.has(mark.id) && lastNow - mark.createdAt <= GARAGE_FIRE_LIFETIME_MS
      && [mark.x1, mark.z1, mark.x2, mark.z2, mark.createdAt, mark.y1 ?? 0, mark.y2 ?? 0].every(Number.isFinite)) {
      origin ??= mark.createdAt; tracks.set(mark.id, mark); dirty = true;
    }
    while (tracks.size > GARAGE_MAX_MARKS) { tracks.delete(tracks.keys().next().value!); dirty = true; }
  }
  return {
    appendMarks: ingest,
    replaceMarks(marks: readonly GarageTireMark[]) {
      const ids = new Set(marks.map(m => m.id));
      for (const id of tracks.keys()) if (!ids.has(id)) { tracks.delete(id); dirty = true; }
      ingest(marks);
    },
    pose(jump?: GarageTimeJump) { if (jump) { jumps.set(jump.id, jump); while (jumps.size > 4) jumps.delete(jumps.keys().next().value!); } },
    update(now: number, visible: boolean, reduced: boolean) {
      if (!Number.isFinite(now)) return;
      lastNow = now;
      for (const [id, mark] of tracks) if (now - mark.createdAt > GARAGE_FIRE_LIFETIME_MS) { tracks.delete(id); dirty = true; }
      for (const [id, jump] of jumps) if (now - jump.arriveAt > GARAGE_FIRE_LIFETIME_MS) jumps.delete(id);
      flames.visible = visible && tracks.size > 0; flash.visible = false; light.intensity = 0;
      if (!visible) return;
      nowUniform.value = origin === undefined ? 0 : (now - origin) / 1000; motion.value = reduced ? 0 : 1;
      if (dirty) {
        let index = 0;
        for (const mark of tracks.values()) for (const t of [.25, .75]) {
          const y = (mark.y1 ?? 0) + ((mark.y2 ?? 0) - (mark.y1 ?? 0)) * t;
          const height = .34 + (mark.id % 3) * .045;
          pose.position.set(THREE.MathUtils.lerp(mark.x1, mark.x2, t), .025 + y + height / 2, THREE.MathUtils.lerp(mark.z1, mark.z2, t));
          pose.scale.set(.2, height, 1); pose.updateMatrix(); flames.setMatrixAt(index, pose.matrix);
          born.setX(index, (mark.createdAt - origin!) / 1000); index++;
        }
        flames.count = index; flames.instanceMatrix.needsUpdate = born.needsUpdate = true; dirty = false;
      }
      const latest = [...jumps.values()].at(-1);
      if (!latest) return;
      const arriving = now >= latest.arriveAt, at = arriving ? latest.arriveAt : latest.startedAt;
      const age = Math.max(0, (now - at) / 1000), point = arriving ? GARAGE_CAR_BAYS.delorean : latest;
      const glow = 1 - THREE.MathUtils.smoothstep(age, .06, .52);
      flash.position.set(point.x, 1.65, point.z + .04);
      flashMaterial.uniforms.strength.value = reduced ? 0 : glow * .78;
      flash.visible = !reduced && glow > 0;
      light.position.set(point.x, garageRampHeightAt(point.x, point.z) + .65, point.z);
      light.intensity = (reduced ? 0 : glow * 3) + Math.max(0, 1 - age / 6) * .6;
    },
    dispose() { flames.removeFromParent(); flash.removeFromParent(); light.removeFromParent(); flames.dispose(); geometry.dispose(); material.dispose(); flash.geometry.dispose(); flashMaterial.dispose(); },
  };
}
