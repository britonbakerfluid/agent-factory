import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFixtureRock } from '../client/prototypes/factory25dFixtureRock';

describe('clickable fixture rocking', () => {
  it('keeps the lamp pieces and emitted light together, then restores the exact placement', () => {
    const room = new THREE.Group(); room.position.set(3, 1, -2); room.rotation.y = .7; room.scale.setScalar(1.2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.2, .8, .2)); body.position.set(1, .4, 2);
    const shade = new THREE.Mesh(new THREE.BoxGeometry(.4, .2, .4)); shade.position.set(1, .9, 2);
    const bulb = new THREE.PointLight(); bulb.position.set(1, .85, 2);
    room.add(body, shade, bulb); room.updateMatrixWorld(true);
    const before = [body, shade, bulb].map(part => part.matrixWorld.clone());
    const distance = shade.getWorldPosition(new THREE.Vector3()).distanceTo(bulb.getWorldPosition(new THREE.Vector3()));
    const rock = createFixtureRock([body, shade, bulb])!;
    rock.press(); rock.update(1 / 30, false); room.updateMatrixWorld(true);
    expect(shade.matrixWorld.equals(before[1])).toBe(false);
    expect(shade.getWorldPosition(new THREE.Vector3()).distanceTo(bulb.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(distance, 10);
    shade.scale.toArray().forEach(value => expect(value).toBeCloseTo(1, 12));
    for (let frame = 0; frame < 240; frame++) {
      if (frame < 60 && frame % 6 === 0) rock.press();
      rock.update(1 / 120, false);
      expect(Math.abs(shade.parent!.rotation.x)).toBeLessThanOrEqual(.045);
    }
    rock.dispose(); room.updateMatrixWorld(true);
    for (const [i, part] of [body, shade, bulb].entries()) {
      expect(part.parent).toBe(room);
      part.matrixWorld.elements.forEach((value, j) => expect(value).toBeCloseTo(before[i].elements[j], 10));
    }
  });

  it('cancels a tip for reduced motion without changing light state or replaying it', () => {
    const room = new THREE.Group(), fixture = new THREE.Group(); room.add(fixture);
    fixture.add(new THREE.Mesh(new THREE.BoxGeometry(.3, .5, .3)));
    const light = new THREE.PointLight('#ffffff', 0); light.visible = false; fixture.add(light);
    const rock = createFixtureRock([fixture])!;
    rock.press(); rock.update(.05, false); rock.update(.01, true);
    expect(fixture.parent!.rotation.x).toBe(0);
    rock.press(); rock.update(.05, true); rock.update(.05, false);
    expect(fixture.parent!.rotation.x).toBe(0);
    expect(light.intensity).toBe(0); expect(light.visible).toBe(false);
    rock.dispose();
  });

  it('lets a flurry knock a standing lamp down, keeps its pieces above the floor, and lifts it back rigidly', () => {
    const room = new THREE.Group(), base = new THREE.Mesh(new THREE.BoxGeometry(.28, .04, .28));
    base.position.y = .02;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.03, .9, .03)); stem.position.y = .47;
    const shade = new THREE.Mesh(new THREE.BoxGeometry(.44, .22, .44)); shade.position.y = 1;
    const bulb = new THREE.PointLight(); bulb.position.y = 1;
    room.add(base, stem, shade, bulb);
    let falls = 0;
    const motion = createFixtureRock([base, stem, shade, bulb], { canFall: true, onFallen: () => falls++ })!;
    const gap = () => base.getWorldPosition(new THREE.Vector3()).distanceTo(shade.getWorldPosition(new THREE.Vector3()));
    const originalGap = gap();
    for (let tap = 0; tap < 4; tap++) { motion.press(); motion.update(.08, false); }
    expect(motion.state).toBe('tipping');
    for (let frame = 0; frame < 180; frame++) {
      motion.update(1 / 120, false); room.updateMatrixWorld(true);
      for (const part of [base, stem, shade]) expect(new THREE.Box3().setFromObject(part).min.y).toBeGreaterThanOrEqual(-.00001);
      expect(gap()).toBeCloseTo(originalGap, 9);
    }
    expect(motion.state).toBe('fallen'); expect(motion.isPending).toBe(true); expect(falls).toBe(1);
    for (let tap = 0; tap < 10; tap++) motion.press();
    motion.update(.1, false); expect(falls).toBe(1);
    motion.recover(); expect(motion.state).toBe('recovering');
    for (let frame = 0; frame < 100; frame++) { motion.update(.01, false); expect(gap()).toBeCloseTo(originalGap, 9); }
    expect(motion.state).toBe('upright'); expect(motion.isPending).toBe(false);
    expect(base.parent!.rotation.x).toBe(0);
    motion.update(.1, false); expect(base.parent!.rotation.x).toBe(0);
    motion.dispose();
  });

  it('does not add isolated taps together and still resolves a deliberate knock-over with reduced motion', () => {
    const room = new THREE.Group(), fixture = new THREE.Mesh(new THREE.BoxGeometry(.3, .6, .3));
    fixture.position.y = .3; room.add(fixture); let falls = 0;
    const motion = createFixtureRock([fixture], { canFall: true, fallAxis: 'z', onFallen: () => falls++ })!;
    for (let tap = 0; tap < 8; tap++) {
      motion.press(); for (let frame = 0; frame < 30; frame++) motion.update(.05, false);
    }
    expect(motion.state).toBe('upright'); expect(falls).toBe(0);
    for (let tap = 0; tap < 4; tap++) motion.press();
    motion.update(.01, true); expect(motion.state).toBe('fallen'); expect(falls).toBe(1);
    expect(fixture.parent!.rotation.z).toBe(-Math.PI / 2);
    motion.recover(); motion.update(.01, true);
    expect(motion.state).toBe('upright'); expect(fixture.parent!.rotation.z).toBe(0);
    motion.update(.05, false); expect(fixture.parent!.rotation.x).toBe(0);
    motion.dispose(); expect(motion.isPending).toBe(false);
  });
});
