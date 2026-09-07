import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Vector3 } from 'three';
import { blendCamera, blendCameraPose, cameraEase, cameraPose } from '../client/prototypes/factory25dCameraMotion';
import { highlightChatMessage, chatUserColor } from '../client/ui/chatMessage';

describe('board and window camera motion', () => {
  it('lands on the saved room framing after an interrupted trip, including non-unit zoom', () => {
    const room = new OrthographicCamera(-8, 8, 5.64, -5.64, 0.1, 50);
    room.position.set(0, 9, 14.6); room.lookAt(0, 0.35, 0.45); room.zoom = 1.2;
    const saved = cameraPose(room);
    const close = room.clone(); close.position.set(4, 1, 6); close.lookAt(4, 1, 5); close.zoom = 8;
    const camera = room.clone();
    blendCamera(camera, saved, cameraPose(close), 0.35, 16 / 9);
    const interrupted = cameraPose(camera);
    blendCamera(camera, interrupted, saved, 1, 16 / 11.28);
    expect(camera.position.distanceTo(saved.position)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(saved.quaternion)).toBeLessThan(1e-6);
    expect(cameraPose(camera).height).toBeCloseTo(saved.height);
  });
  it('uses a symmetric settle and geometric scale at the midpoint', () => {
    expect(cameraEase(-1)).toBe(0); expect(cameraEase(2)).toBe(1);
    expect(cameraEase(0.2)).toBeCloseTo(1 - cameraEase(0.8));
    const camera = new OrthographicCamera(); const pose = cameraPose(camera);
    blendCamera(camera, { ...pose, height: 16 }, { ...pose, height: 1 }, 0.5, 2);
    expect(camera.top - camera.bottom).toBeCloseTo(4);
    expect(camera.right - camera.left).toBeCloseTo(8);
  });

  it.each([16 / 9, 390 / 844])('homes in on an off-centre subject without drifting past it at aspect %s', aspect => {
    const room = new OrthographicCamera(-5.64 * aspect, 5.64 * aspect, 5.64, -5.64, .1, 50);
    room.position.set(0, 9, 14.6); room.lookAt(0, .35, .45); room.updateMatrixWorld();
    const focus = new Vector3(-7, .68, -2.3), close = room.clone();
    close.position.copy(focus).add(new Vector3(0, .069, .48)); close.lookAt(focus);
    // Leave room below the subject for the dock, as the actual board does.
    close.position.add(new Vector3(0, -.1, 0).applyQuaternion(close.quaternion));
    close.zoom = 8.5; close.updateProjectionMatrix(); close.updateMatrixWorld();
    const from = cameraPose(room), to = cameraPose(close), start = focus.clone().project(room), end = focus.clone().project(close);
    const camera = room.clone();
    for (let frame = 0; frame <= 60; frame++) {
      const progress = frame / 60, t = cameraEase(progress);
      blendCamera(camera, from, to, progress, aspect, focus);
      const projected = focus.clone().project(camera);
      expect(projected.x).toBeCloseTo(start.x + (end.x - start.x) * t, 8);
      expect(projected.y).toBeCloseTo(start.y + (end.y - start.y) * t, 8);
      expect(projected.z).toBeGreaterThan(-1); expect(projected.z).toBeLessThan(1);
    }
    expect(camera.position.distanceTo(to.position)).toBeLessThan(1e-9);
    expect(camera.quaternion.angleTo(to.quaternion)).toBeLessThan(1e-6);
    // A click to return while closing in must start at exactly the current frame.
    blendCamera(camera, from, to, .43, aspect, focus);
    const interrupted = cameraPose(camera);
    blendCamera(camera, interrupted, from, 0, aspect, focus);
    expect(camera.position.distanceTo(interrupted.position)).toBeLessThan(1e-9);
    blendCamera(camera, interrupted, from, 1, aspect, focus);
    expect(camera.position.distanceTo(from.position)).toBeLessThan(1e-9);
    expect(cameraPose(camera).height).toBeCloseTo(from.height);
  });

  it('keeps the whiteboard zoom and shared frustum cameras on the same focus path', () => {
    const camera = new OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
    camera.position.set(0, 9, 14.6); camera.lookAt(0, .35, .45);
    const from = cameraPose(camera), focus = new Vector3(-7, .68, -2.3), close = camera.clone();
    close.position.copy(focus).add(new Vector3(0, .07, .48)); close.lookAt(focus); close.zoom = 8.5;
    const to = cameraPose(close), frustumCamera = camera.clone();
    for (const progress of [0, .1, .5, .9, 1]) {
      const height = blendCameraPose(camera, from, to, progress, focus);
      camera.zoom = (camera.top - camera.bottom) / height;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      blendCamera(frustumCamera, from, to, progress, 16 / 11.28, focus);
      expect(focus.clone().project(camera).distanceTo(focus.clone().project(frustumCamera))).toBeLessThan(1e-9);
    }
  });
});

it('renders chat markup as text while retaining the existing mention and command highlights', () => {
  const output = highlightChatMessage('<img src=x onerror=alert(1)> @Ada /help :wave: &');
  expect(output).not.toContain('<img');
  expect(output).toContain('&lt;img');
  expect(output).toContain('<span class="hl-mention">@Ada</span>');
  expect(output).toContain('<span class="hl-cmd">/help</span>');
  expect(output).toContain('<span class="hl-emote">:wave:</span>');
  expect(chatUserColor('Ada')).toBe(chatUserColor('Ada'));
});
