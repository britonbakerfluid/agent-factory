// Injected only by the local audit server; absent from the production bundle.
(() => {
  const panel = document.createElement('div');
  panel.id = 'benchmark-panel';
  panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;background:#fff;color:#111;padding:12px;font:14px monospace;max-width:440px';
  const button = document.createElement('button');
  button.textContent = 'Measure three frame samples';
  const output = document.createElement('pre');
  output.textContent = '18 fixed agents · choose room, then measure';
  panel.append(button, output);
  document.body.append(panel);
  button.onclick = () => {
    button.disabled = true;
    let start = performance.now(), previous = 0, sample = 0;
    let frames = [], longTasks = [], hidden = false;
    const results = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    observer.observe({ type: 'longtask' });
    function tick(now) {
      hidden ||= document.hidden;
      if (now - start < 5000) {
        output.textContent = 'warming up…';
        previous = now;
        requestAnimationFrame(tick);
        return;
      }
      if (previous) frames.push(now - previous);
      previous = now;
      if (now - start >= 15000) {
        const sorted = [...frames].sort((a, b) => a - b);
        const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
        results.push({
          sample: ++sample, frames: frames.length, fps: 1000 / mean, meanMs: mean,
          p95Ms: sorted[Math.floor(sorted.length * .95)],
          over33ms: frames.filter(ms => ms > 33.4).length,
          longTasks: longTasks.length, longTaskMs: longTasks.reduce((a, b) => a + b, 0), hidden,
        });
        frames = []; longTasks = []; start = now - 5000; previous = now;
        output.textContent = JSON.stringify(results, null, 1);
        if (sample === 3) {
          observer.disconnect(); button.disabled = false;
          fetch('/benchmark-result', {
            method: 'POST',
            body: JSON.stringify({ url: location.href, garage: document.body.classList.contains('garage-open'), width: innerWidth, height: innerHeight, results }),
          }).catch(() => output.append('\nCould not save results; copy the samples above.'));
          return;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
})();
