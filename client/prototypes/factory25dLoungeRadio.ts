import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import { onFactoryMessage, onFactoryConnection, sendFactoryCommand, isControlPreview } from './factory25dBoardData';
import { LoungeRadioQueue, DJ_VIDEOS, youtubeVideoId, type RadioState, type RadioRequest } from '@shared/lounge-radio';
import './factory25dLoungeRadio.css';
import { createYoutubePlayer } from './factory25dYoutubePlayer';
import { createRadioDj } from './factory25dRadioDj';

/** Small lounge receiver, with a nonmodal queue above the existing shared dock. */
export function createLoungeRadio(parent: THREE.Group, canvas: HTMLCanvasElement, initialCamera: THREE.Camera,
  callbacks: { preferences(): { enabled: boolean; volume: number }; enable(): void }) {
  const group = new THREE.Group(); group.name = 'lounge-radio'; group.position.set(3.05, .018, 6.12); parent.add(group);
  const wood = standard('#775441'), dark = standard('#303d3b'), cream = standard('#ddd2aa'), metal = standard('#9b9d8a', .5);
  propPart(group, [.55, .06, .43], [0, .43, 0], wood);
  for (const x of [-.2, .2]) for (const z of [-.15, .15]) propPart(group, [.04, .4, .04], [x, .2, z], dark);
  const receiver = new THREE.Group(); receiver.position.set(0, .61, 0); receiver.rotation.y = -.2; group.add(receiver);
  propPart(receiver, [.46, .28, .19], [0, 0, 0], wood);
  propPart(receiver, [.418, .235, .012], [0, 0, .104], cream);
  propPart(receiver, [.205, .182, .013], [-.082, 0, .115], dark);
  for (let i = 0; i < 8; i++) propPart(receiver, [.18, .006, .012], [-.082, -.073 + i * .021, .126], metal);
  propPart(receiver, [.125, .046, .012], [.128, .058, .118], dark);
  propPart(receiver, [.084, .006, .006], [.128, .058, .127], cream);
  for (const x of [.096, .164]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(.023, .023, .025, 12), dark);
    knob.rotation.x = Math.PI / 2; knob.position.set(x, -.055, .127); receiver.add(knob);
  }
  propPart(receiver, [.017, .29, .017], [-.16, .255, -.035], metal).rotation.z = -.19;
  const lamp = new THREE.MeshBasicMaterial({ color: '#6b6e40' });
  propPart(receiver, [.018, .018, .015], [.19, .058, .126], lamp);
  const panel = document.createElement('section'); panel.className = 'lounge-radio-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Lounge radio');
  panel.innerHTML = '<header><h2>lounge music · YouTube</h2><button type="button" aria-label="Close radio">×</button></header><div class="radio-video"></div><p class="radio-playing"></p><div class="radio-actions"><button type="button" class="radio-listen">listen</button><button type="button" class="radio-skip">skip song</button></div><form><label for="radio-video-url">add a YouTube video</label><div class="radio-add"><input id="radio-video-url" type="url" placeholder="https://www.youtube.com/watch?v=…" required maxlength="2048"><button type="submit">add</button></div></form><p>up next · move songs with ↑ ↓</p><ol></ol><p><small>The DJ picks day, evening and night mixes when nobody queues music. Your songs take priority. Playback pauses when this player closes. Music volume is in sound settings.</small></p><p class="radio-feedback" role="status"></p>';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'lounge-radio-target'; trigger.textContent = 'radio';
  trigger.title = 'Lounge radio · open song queue';
  trigger.setAttribute('aria-label', 'Open lounge radio and song queue'); trigger.setAttribute('aria-expanded', 'false');
  const close = panel.querySelector('header button') as HTMLButtonElement;
  const playing = panel.querySelector('.radio-playing')!;
  const input = panel.querySelector('input')!;
  const form = panel.querySelector('form')!;
  const queue = panel.querySelector('ol')!;
  const feedback = panel.querySelector('.radio-feedback')!;
  document.body.append(trigger, panel);
  let state: RadioState | undefined, pending = false, timeout = 0, visible = false, camera = initialCamera;
  const preview = isControlPreview() ? new LoungeRadioQueue() : undefined;
  let nextPreviewTick = 0, nextPaint = 0;
  let paintRevision = -1;
  const player = createYoutubePlayer(panel.querySelector('.radio-video')!, {
    ...callbacks, feedback: message => { feedback.textContent = message; },
    duration: (entryId, seconds) => command({ type: 'radio_queue', action: 'duration', entryId, seconds }),
  });
  function paint() {
    playing.textContent = state?.current ? `${state.current.title} · ${state.current.queuedBy}` : 'Connecting to the shared radio…';
    if (paintRevision !== state?.revision) {
      paintRevision = state?.revision ?? -1; queue.replaceChildren();
      (state?.queue ?? []).forEach((entry, index, entries) => {
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = `${entry.title} · ${entry.queuedBy}`; li.append(name);
        for (const direction of [-1, 1]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = direction < 0 ? '↑' : '↓';
          button.setAttribute('aria-label', `Move ${entry.title} ${direction < 0 ? 'up' : 'down'}`);
          button.disabled = index + direction < 0 || index + direction >= entries.length;
          button.addEventListener('click', () => {
            if (!state) return;
            const ids = state.queue.map(item => item.id), currentIndex = ids.indexOf(entry.id), to = currentIndex + direction;
            if (currentIndex < 0 || to < 0 || to >= ids.length) return;
            [ids[currentIndex], ids[to]] = [ids[to], ids[currentIndex]];
            command({ type: 'radio_queue', action: 'reorder', ids, revision: state.revision });
          }); li.append(button);
        }
        queue.append(li);
      });
      if (!state?.queue.length) { const li = document.createElement('li'); li.textContent = 'Your next song goes here. The DJ has the quiet moments covered.'; queue.append(li); }
    }
    (form.querySelector('button') as HTMLButtonElement).disabled = pending;
    lamp.color.set(state?.current ? '#edc568' : '#6b6e40');
  }
  function receive(next: RadioState) { state = next; paint(); player.update(state); }
  function settle(error?: string) { pending = false; clearTimeout(timeout); feedback.textContent = error ?? 'Queue updated.'; paint(); }
  function command(message: RadioRequest) {
    if (message.action !== 'duration' && pending) return;
    if (preview) {
      const now = Date.now();
      const result = message.action === 'add' ? preview.enqueue(message.videoId, 'Local preview', now, DJ_VIDEOS.find(video => video.videoId === message.videoId)?.title)
        : message.action === 'reorder' ? preview.reorder(message.ids, message.revision)
        : message.action === 'duration' ? preview.duration(message.entryId, message.seconds, now)
        : preview.skip(message.entryId, now);
      receive(preview.snapshot(now)); if (message.action !== 'duration') settle(result.error); return;
    }
    const sent = sendFactoryCommand(message);
    if (message.action === 'duration') return;
    if (!sent) { settle('Connect your browser to change the shared queue.'); return; }
    pending = true; feedback.textContent = 'Updating the shared queue…'; paint();
    timeout = window.setTimeout(() => settle('The radio did not respond. Try again.'), 8000);
  }
  form.addEventListener('submit', event => {
    event.preventDefault(); const videoId = youtubeVideoId(input.value);
    if (!videoId) { feedback.textContent = 'Paste a YouTube video link.'; return; }
    command({ type: 'radio_queue', action: 'add', videoId });
  });
  panel.querySelector('.radio-listen')!.addEventListener('click', () => player.play());
  panel.querySelector('.radio-skip')!.addEventListener('click', () => { if (state?.current) command({ type: 'radio_queue', action: 'skip', entryId: state.current.id }); });
  function hide(restore = false) { panel.hidden = true; player.hide(); trigger.setAttribute('aria-expanded', 'false'); if (restore && visible) trigger.focus(); }
  trigger.addEventListener('click', () => { if (!visible) return; panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) { const agents = document.querySelector<HTMLDetailsElement>('.factory-controls'); if (agents) agents.open = false; paint(); void player.open(); close.focus(); } else player.hide(); });
  close.addEventListener('click', () => hide(true));
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !panel.hidden) { event.stopPropagation(); hide(true); } };
  document.addEventListener('keydown', onKey, true);
  const unsubscribe = onFactoryMessage(message => {
    if (preview) return;
    if (message.type === 'radio_state') receive(message);
    if (message.type === 'radio_result' && !message.silent) settle(message.success ? undefined : message.error ?? 'Could not add that song.');
  });
  const stopConnection = onFactoryConnection(connected => { if (!connected && !preview) { state = undefined; if (pending) settle('Connection lost. Reconnect to add music.'); paint(); } });
  if (preview) receive(preview.snapshot(Date.now())); else paint();
  const dj = createRadioDj(parent, canvas, () => trigger.click());
  const playbackTimer = window.setInterval(() => {
    if (preview && preview.advance(Date.now())) receive(preview.snapshot(Date.now()));
    player.update(state);
  }, 500);
  const projected = new THREE.Vector3();
  return {
    group,
    update(nextCamera: THREE.Camera, isVisible: boolean) {
      camera = nextCamera; visible = isVisible;
      trigger.hidden = !visible;
      if (!visible) hide();
      if (visible) {
        receiver.getWorldPosition(projected); projected.project(camera);
        const rect = canvas.getBoundingClientRect();
        trigger.style.left = `${rect.left + (projected.x + 1) * rect.width / 2}px`;
        trigger.style.top = `${rect.top + (1 - projected.y) * rect.height / 2}px`;
      }
      const now = performance.now();
      if (preview && now > nextPreviewTick) { nextPreviewTick = now + 1000; if (preview.advance(Date.now())) receive(preview.snapshot(Date.now())); }
      if (now > nextPaint && !panel.hidden) { nextPaint = now + 1000; paint(); }
      dj.update(camera, visible, state?.current?.id, state?.current?.dj ?? false);
    },
    dispose() {
      clearTimeout(timeout); clearInterval(playbackTimer); unsubscribe(); stopConnection(); document.removeEventListener('keydown', onKey, true);
      player.dispose(); dj.dispose(); panel.remove(); trigger.remove(); group.removeFromParent();
      const materials = new Set<THREE.Material>(); group.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
      materials.forEach(material => material.dispose());
    },
  };
}
