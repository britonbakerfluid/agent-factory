/** Own the frame callback so replacing a scene cannot leave it running. */
export function startSceneLoop(update: () => void): () => void {
  let stopped = false;
  let frame = 0;
  const tick = () => {
    if (stopped) return;
    update();
    if (!stopped) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
