import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { WorldAgent, WorldSnapshot } from '../shared/types';
import { AGENT_ARRIVAL_MS, agentArrivalPose, NewAgentArrivals } from '../client/prototypes/factory25dAgentArrival';
import { createAgentArrivalVisual } from '../client/prototypes/factory25dAgentArrivalVisual';
import { projectNameTagAnchor } from '../client/prototypes/factory25dLabels';

function agent(sessionId: string, startedAt = 1000): WorldAgent {
  return { sessionId, username: sessionId, avatar: DEFAULT_AVATAR, cwd: '/factory', activity: 'idle', currentTool: null,
    subagents: [], startedAt, lastEventAt: startedAt, world: { zone: 'entrance', position: { x: 400, y: 300 }, facing: 'down' } };
}
function snapshot(agents: WorldAgent[], serverTime = 1000, revision = 1): WorldSnapshot {
  return { schemaVersion: 1, revision, serverTime, agents, environment: 'factory25d', tombstones: [], events: [], chat: [] };
}

describe('new live agent entrances', () => {
  it('hydrates silently then drops only genuinely new, recent IDs once', () => {
    const state = new NewAgentArrivals(); state.sync(snapshot([agent('already-here')]));
    expect(state.active.size).toBe(0);
    state.sync(snapshot([agent('already-here'), agent('new', 1200), agent('old-history', 0)], 3500, 2));
    expect([...state.active.keys()]).toEqual(['new']);
    const pose = state.sample('new', 3700, false)!;
    expect(pose.lift).toBeGreaterThan(1); expect(pose.lift).toBeLessThan(1.8);
    state.sync(snapshot([agent('new', 1200)], 3800, 3));
    expect(state.sample('new', 3700, false)).toEqual(pose);
    expect(state.sample('new', 3500 + AGENT_ARRIVAL_MS, false)).toBeUndefined();
    state.sync(snapshot([], 5000, 4)); state.sync(snapshot([agent('new', 5100)], 5200, 5));
    expect(state.active.size).toBe(0); // A resumed session ID is not another arrival.
  });

  it('suppresses reconnect catch-up, resync snapshots, revision resets, and tombstone returns', () => {
    const state = new NewAgentArrivals(); state.sync(snapshot([]));
    state.baseline();
    state.sync(snapshot([agent('during-disconnect', 1200)], 1300, 2));
    expect(state.active.size).toBe(0);
    state.baseline(snapshot([agent('snapshot-only', 1400)], 1500, 3));
    state.sync(snapshot([agent('snapshot-only', 1400)], 1500, 3));
    expect(state.active.size).toBe(0);
    state.sync(snapshot([agent('server-restart', 1600)], 1600, 1));
    expect(state.active.size).toBe(0);
    const withGrave = snapshot([], 2000, 2);
    withGrave.tombstones = [{ sessionId: 'returning', username: 'returning', avatar: DEFAULT_AVATAR,
      position: { x: 400, y: 300 }, createdAt: 1800, expiresAt: 10000 }];
    state.sync(withGrave); state.sync(snapshot([agent('returning', 2200)], 2250, 3));
    expect(state.active.size).toBe(0);
    state.sync(snapshot([agent('fresh', 2400)], 2450, 4));
    expect(state.active.has('fresh')).toBe(true);
  });

  it('does not replay for avatar changes, travel, controlled/stopped actors or reduced motion', () => {
    const state = new NewAgentArrivals(), existing = agent('existing'); state.sync(snapshot([existing]));
    const controlled = agent('controlled', 1200); controlled.manualControl = { x: 400, y: 300, facing: 'down', moving: true };
    const stopped = agent('stopped', 1200); stopped.activity = 'stopped';
    state.sync(snapshot([{ ...existing, avatar: { ...DEFAULT_AVATAR, hairStyle: 4 },
      world: { ...existing.world, position: { x: 900, y: 400 } } }, controlled, stopped], 1250, 2));
    expect(state.active.size).toBe(0);
    state.sync(snapshot([agent('quiet', 1400)], 1450, 3));
    expect(state.sample('quiet', 1460, true)).toBeUndefined();
    expect(state.sample('quiet', 1500, false)).toBeUndefined();
    state.sync(snapshot([agent('cancelled', 1600)], 1600, 4)); state.cancel('cancelled');
    expect(state.sample('cancelled', 1650, false)).toBeUndefined();
    state.clear(); expect(state.active.size).toBe(0);
  });

  it('falls faster toward the floor, lands without stretching, and leaves its label on its feet', () => {
    const start = agentArrivalPose(0), early = agentArrivalPose(140), middle = agentArrivalPose(280), impact = agentArrivalPose(560);
    expect(start.lift - early.lift).toBeLessThan(early.lift - middle.lift);
    expect(impact.lift).toBe(0); expect(impact.impact).toBe(0);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86));
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 100);
    camera.position.set(0, 4, 10); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const feet = new THREE.Vector3(0, -.25, 0);
    for (let time = 0; time <= AGENT_ARRIVAL_MS; time += 10) {
      const pose = agentArrivalPose(time);
      expect(pose.lift).toBeGreaterThanOrEqual(0); expect(pose.lift).toBeLessThanOrEqual(1.8);
      mesh.position.set(0, .268 + pose.lift, 1); mesh.rotation.z = pose.angle;
      const anchor = projectNameTagAnchor(mesh, .018, camera, new THREE.Vector3(), feet);
      const actualBoots = mesh.localToWorld(feet.clone()).project(camera);
      expect(anchor.distanceTo(actualBoots)).toBeLessThan(1e-10);
      expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    }
    expect(agentArrivalPose(AGENT_ARRIVAL_MS)).toEqual({ lift: 0, angle: 0, shadowScale: 1, shadowOpacity: 1, impact: 1 });
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });

  it('keeps contact shadows on the floor and cleans private landing resources without touching shared materials', () => {
    const room = new THREE.Group(); room.position.y = -5;
    const original = new THREE.MeshBasicMaterial({ opacity: .3 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), original);
    shadow.position.set(2, .021, 3); shadow.scale.set(.35, .2, 1); room.add(shadow);
    const position = shadow.position.clone(), scale = shadow.scale.clone();
    const effect = createAgentArrivalVisual(shadow); let sharedDisposed = false, privateDisposed = false;
    original.addEventListener('dispose', () => { sharedDisposed = true; });
    (shadow.material as THREE.Material).addEventListener('dispose', () => { privateDisposed = true; });
    effect.update(agentArrivalPose(200));
    expect(shadow.position.toArray()).toEqual(position.toArray());
    expect((shadow.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(.3);
    const dust = room.getObjectByName('agent-arrival-landing') as THREE.InstancedMesh;
    expect(dust.visible).toBe(false);
    effect.update(agentArrivalPose(640)); expect(dust.visible).toBe(true);
    expect(dust.position.toArray()).toEqual(position.toArray()); expect(dust.count).toBe(6);
    effect.dispose();
    expect(room.children).toEqual([shadow]); expect(shadow.material).toBe(original);
    expect(shadow.scale.toArray()).toEqual(scale.toArray());
    expect(privateDisposed).toBe(true); expect(sharedDisposed).toBe(false);
    shadow.geometry.dispose(); original.dispose();
  });
});
