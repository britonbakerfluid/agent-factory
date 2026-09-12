import * as THREE from 'three';

/** Project a virtual mirrored sprite onto the glass, in front of the opaque panorama.
 * Window frames still depth-occlude it. Shared avatar maps retain the exact live frame.
 */
export function createWindowReflections(scene: THREE.Scene) {
  const glassZ = -4.46;
  const reflections = new Map<THREE.Mesh, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();
  const world = new THREE.Vector3(), virtual = new THREE.Vector3(), direction = new THREE.Vector3();
  const scale = new THREE.Vector3();
  return {
    update(agents: Iterable<{mesh: THREE.Mesh}>, camera: THREE.Camera, dt: number, visible: boolean) {
      const retained = new Set<THREE.Mesh>();
      camera.getWorldDirection(direction);
      for (const {mesh} of agents) {
        retained.add(mesh);
        mesh.getWorldPosition(world);
        const distance = world.z - glassZ;
        const eligible = visible && mesh.visible && mesh.userData.room === 'factory' && !mesh.userData.pickupActive
          && distance >= 0 && distance < 2.3 && Math.abs(world.x) < 7.9;
        let reflection = reflections.get(mesh);
        if (!reflection && !eligible) continue;
        if (!reflection) {
          const material = new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,color:'#c2c9ce',alphaTest:.015});
          material.onBeforeCompile = shader => {
            shader.vertexShader = 'varying vec3 glassPosition;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nglassPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = 'varying vec3 glassPosition;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
              float edge = smoothstep(.012, .16, glassPosition.y) * (1.0-smoothstep(3.45,3.61,glassPosition.y));
              edge *= 1.0-smoothstep(7.75,7.92,abs(glassPosition.x));
              diffuseColor.a *= edge;
              #include <alphatest_fragment>
            `);
          };
          reflection = new THREE.Mesh(mesh.geometry, material);
          reflection.name = 'window-avatar-reflection'; reflection.renderOrder = 1; reflection.frustumCulled = false;
          scene.add(reflection); reflections.set(mesh, reflection);
        }
        const target = eligible ? .2 * (1-THREE.MathUtils.smoothstep(distance,.15,2.3)) : 0;
        reflection.material.opacity = THREE.MathUtils.lerp(reflection.material.opacity,target,1-Math.exp(-Math.min(dt,.1)*9));
        reflection.visible = visible && reflection.material.opacity > .002;
        if (!reflection.visible) continue;
        const map = (mesh.material as THREE.MeshStandardMaterial).map;
        if (reflection.material.map !== map) {reflection.material.map=map;reflection.material.needsUpdate=true;}
        reflection.geometry=mesh.geometry;
        virtual.copy(world); virtual.z=2*glassZ-world.z;
        // Orthographic viewing ray from the virtual image back onto the glass.
        const along = Math.abs(direction.z)>.001 ? (glassZ-virtual.z)/direction.z : 0;
        reflection.position.copy(virtual).addScaledVector(direction,along);
        mesh.getWorldScale(scale);
        reflection.rotation.set(0,0,mesh.rotation.z); reflection.scale.set(-scale.x,scale.y,scale.z);
      }
      for (const [source, reflection] of reflections) if (!retained.has(source)) {
        reflection.removeFromParent(); reflection.material.dispose(); reflections.delete(source);
      }
    },
    dispose() {for(const reflection of reflections.values()){reflection.removeFromParent();reflection.material.dispose();}reflections.clear();},
  };
}
