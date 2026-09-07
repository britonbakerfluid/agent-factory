import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createGarageCarAnimation } from '../client/prototypes/factory25dGarageCarAnimation';
import { GARAGE_CAR_IDS, GARAGE_CAR_BAYS, GARAGE_CAR_SCALE, GARAGE_CAR_YAW, GARAGE_PARKED_BOUNDS, garageCarLookout, garageCarVisitPose } from '../shared/factory25d-garage';
import { GARAGE_LEVEL, toFactoryWorld } from '../shared/factory25d-layout';
import type { createLiveAgents } from '../client/prototypes/factory25dLiveAgents';

async function model(id: string) {
  const bytes = await readFile(new URL(`../client/assets/prototype25d/garage/${id}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '');
  const root = new THREE.Group(); root.add(gltf.scene); root.scale.setScalar(GARAGE_CAR_SCALE); return root;
}

describe('parked car geometry and boarding', () => {
  it('keeps pedestrian collision bounds aligned with all four actual display models', async () => {
    for (const id of GARAGE_CAR_IDS) {
      const root=await model(id); root.rotation.y=GARAGE_CAR_YAW;
      const bounds=new THREE.Box3().setFromObject(root,true), expected=GARAGE_PARKED_BOUNDS[id];
      expect(bounds.min.x).toBeCloseTo(expected.left,5); expect(bounds.max.x).toBeCloseTo(expected.right,5);
      expect(bounds.min.z).toBeCloseTo(expected.near,5); expect(bounds.max.z).toBeCloseTo(expected.far,5);
      root.rotation.y=0;
      const straight=new THREE.Box3().setFromObject(root,true).getSize(new THREE.Vector3());
      expect(straight.x).toBeLessThan(1.91-.5); // At least .25 per side between ramp curbs.
    }
  });

  it('opens the Mini door outward, uses its real seat, and clears the engine/hinge on cancellation', async () => {
    const root=await model('mini'), room=new THREE.Group(); room.position.y=GARAGE_LEVEL; room.add(root);
    root.position.set(GARAGE_CAR_BAYS.mini.x,.025,GARAGE_CAR_BAYS.mini.z);root.rotation.y=GARAGE_CAR_YAW;
    const passenger={session:{sessionId:'visitor',activity:'idle',world:{position:toFactoryWorld(garageCarLookout('mini')),carVisit:{car:'mini',startedAt:1000}}}};
    let now=3400;
    const poseGaragePassenger=vi.fn(), actors={entries:new Map([['visitor',passenger]]),serverNow:()=>now,poseGaragePassenger};
    const animation=createGarageCarAnimation(new Map([['mini',root]])); animation.configure(actors as unknown as ReturnType<typeof createLiveAgents>);
    animation.update(true,false);
    let door:THREE.Object3D|undefined;root.traverse(node=>{if(node.userData.role==='door'&&node.name.startsWith('door_left'))door=node;});
    expect(door).toBeDefined();
    expect(door!.rotation.y).toBeGreaterThan(.9);
    now=6100; animation.update(true,false);
    expect(animation.engine()).toMatchObject({car:'mini',throttle:expect.any(Number)});
    const call=poseGaragePassenger.mock.lastCall!;
    expect(call[2]).toBeCloseTo(.445-.018,4); expect(call[3]).toBe(1);
    animation.update(false,false); expect(animation.engine()).toBeUndefined();
    passenger.session.activity='reading';animation.update(true,false);
    expect(door!.rotation.y).toBe(0);expect(animation.engine()).toBeUndefined();
  });

  it('keeps the driver seated and doors shut during revs, and returns fully outside', () => {
    for(let elapsed=0;elapsed<12000;elapsed+=20) {
      const pose=garageCarVisitPose(elapsed);
      if(pose.engine) {expect(pose.seat).toBe(1);expect(pose.door).toBe(0);}
      for(const value of [pose.approach,pose.seat,pose.door,pose.throttle]) {expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
    }
    expect(garageCarVisitPose(12000)).toMatchObject({approach:0,seat:0,door:0,engine:false,throttle:0});
  });
});
