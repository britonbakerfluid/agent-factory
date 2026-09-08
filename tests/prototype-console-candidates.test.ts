import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createConsoleCandidate, CONSOLE_CANDIDATES } from '../client/prototypes/factory25dConsoleCandidates';
vi.mock('../client/prototypes/factory25dLabels', () => ({ signTexture: () => new THREE.Texture() }));

it.each(CONSOLE_CANDIDATES.map((spec, index) => ({ ...spec, index })))
  ('$name fits the workstation footprint and retains live feedback with bounded geometry', spec => {
    const { index } = spec;
    const root = new THREE.Group(), screen = new THREE.MeshStandardMaterial(), accent = new THREE.MeshStandardMaterial();
    const candidate = createConsoleCandidate(root, index, screen, accent);
    root.scale.setScalar(.66); root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.x).toBeGreaterThan(-.36); expect(bounds.max.x).toBeLessThan(.36);
    expect(bounds.min.z).toBeGreaterThan(-.3); expect(bounds.max.z).toBeLessThan(.32);
    expect(size.y).toBeLessThan(.9);
    const meshes = root.children as THREE.Mesh[];
    expect(meshes.length).toBeLessThanOrEqual(10);
    const triangles = meshes.reduce((count, mesh) => count + mesh.geometry.attributes.position.count / 3, 0);
    expect(triangles).toBeLessThan(2_000);
    expect(meshes.some(mesh => mesh.material === screen)).toBe(true);
    expect(meshes.some(mesh => mesh.material === accent)).toBe(true);
    expect(root.userData.consoleCandidate).toBe(spec.name);
    expect(meshes.every(mesh => [...mesh.geometry.attributes.position.array].every(Number.isFinite))).toBe(true);
    const ownedGeometry = meshes.map(mesh => vi.spyOn(mesh.geometry, 'dispose'));
    const screenDispose = vi.spyOn(screen, 'dispose'), accentDispose = vi.spyOn(accent, 'dispose'); candidate.dispose();
    ownedGeometry.forEach(dispose => expect(dispose).toHaveBeenCalledOnce());
    expect(screenDispose).not.toHaveBeenCalled();
    expect(accentDispose).not.toHaveBeenCalled();
});
