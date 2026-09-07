import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHONE, phoneCameraPose } from '../client/prototypes/factory25dLoungePhone';

describe('lounge phone framing', () => {
  it.each([[1280,720],[936,1044],[390,844],[844,390]])('fits the physical phone and leaves the return control clear at %ix%i', (width,height) => {
    const table = new THREE.Group(); table.position.set(2.15,.018,7.9);
    const phone = new THREE.Group(); phone.position.set(-.22,.435,.025); phone.rotation.set(-Math.PI/2,0,-.12); table.add(phone);
    const pose = phoneCameraPose(phone,width,height);
    const camera = new THREE.OrthographicCamera(-pose.height*width/height/2,pose.height*width/height/2,pose.height/2,-pose.height/2,.01,50);
    camera.position.copy(pose.position); camera.quaternion.copy(pose.quaternion); camera.updateMatrixWorld();
    for (const x of [-1,1]) for (const y of [-1,1]) {
      const projected = phone.localToWorld(new THREE.Vector3(x*PHONE.width/2,y*PHONE.height/2,PHONE.faceZ)).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      const pixelY = (1-projected.y)*height/2;
      expect(pixelY).toBeGreaterThanOrEqual(35.9);
      expect(pixelY).toBeLessThanOrEqual(height-89.9);
    }
    const normal = new THREE.Vector3(0,0,1).applyQuaternion(phone.getWorldQuaternion(new THREE.Quaternion()));
    expect(camera.position.clone().sub(phone.getWorldPosition(new THREE.Vector3())).dot(normal)).toBeGreaterThan(.69);
  });
});
