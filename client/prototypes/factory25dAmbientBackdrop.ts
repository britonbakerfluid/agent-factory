import './factory25dAmbientBackdrop.css';

/** Slowly average the room palette; small scene movements never animate the surround. */
export function createAmbientBackdrop(source: HTMLCanvasElement) {
  const backdrop = document.createElement('div'); backdrop.className = 'factory-ambient-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  const layers = [document.createElement('canvas'), document.createElement('canvas')];
  for (const layer of layers) { layer.width = layer.height = 64; backdrop.append(layer); }
  let front = 0;
  document.body.prepend(backdrop); document.body.classList.add('factory-ambient');
  const sample = document.createElement('canvas'); sample.width = 16; sample.height = 12;
  const ink = sample.getContext('2d', { willReadFrequently: true });
  let last = -Infinity, failed = false;
  let averaged: number[][] | undefined, published: number[][] | undefined;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  return {
    update(now: number) {
      if (!ink || failed || document.hidden || now - last < (reduced.matches ? 30000 : 16000)) return;
      last = now;
      try {
        ink.drawImage(source, 0, 0, 16, 12);
        const pixels = ink.getImageData(0, 0, 16, 12).data;
        const colors: number[][] = [];
        for (const [x0, x1, y0, y1] of [[0,8,0,6],[8,16,0,6],[0,8,6,12],[8,16,6,12]]) {
          const sum = [0,0,0]; let count = 0;
          for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
            const i=(y*16+x)*4;
            for(let c=0;c<3;c++) sum[c]+=pixels[i+c]; count++;
          }
          const mean=sum.map(value=>value/count), gray=(mean[0]+mean[1]+mean[2])/3;
          colors.push(mean.map(value=>Math.max(12,Math.min(150,(gray+(value-gray)*1.25)*.82))));
        }
        // A long running average rejects passing characters, flicker, and camera motion.
        averaged = colors.map((color,i) => color.map((value,c) => averaged ? averaged[i][c] + (value-averaged[i][c])*.22 : value));
        if (published && averaged.every((color,i) => color.every((value,c) => Math.abs(value-published![i][c]) < 2))) return;
        published = averaged.map(color => [...color]);
        // Paint a tiny opaque texture once. Only its opacity animates on the compositor.
        // Keep the old image opaque underneath so the crossfade never pulses darker.
        const next = 1-front, layer = layers[next], brush = layer.getContext('2d');
        if (!brush) return;
        layer.style.transition = 'none'; layer.style.opacity = '0'; layer.style.zIndex = '1';
        layers[front].style.zIndex = '0'; layers[front].style.opacity = '1';
        brush.fillStyle = '#15191d'; brush.fillRect(0,0,64,64);
        for (const i of [3,2,1,0]) {
          const x=i%2 ? 58 : 6, y=i<2 ? 13 : 51;
          const gradient=brush.createRadialGradient(x,y,0,x,y,65);
          const color=published[i].map(Math.round).join(',');
          gradient.addColorStop(0,`rgba(${color},1)`); gradient.addColorStop(1,`rgba(${color},0)`);
          brush.fillStyle=gradient; brush.fillRect(0,0,64,64);
        }
        // Commit the hidden start once per palette change, never once per animation frame.
        void layer.offsetWidth;
        layer.style.transition = reduced.matches ? 'none' : 'opacity 12s linear'; layer.style.opacity = '1';
        front=next;
      } catch { failed=true; backdrop.remove(); }
    },
    dispose() { backdrop.remove(); document.body.classList.remove('factory-ambient'); },
  };
}
