import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { createProfilePortrait } from './factory25dPortrait';
import { contributionLevel, type ContributionRecord } from '@shared/factory-contributions';
import './factory25dContributions.css';

// Seven-pixel lettering survives the room's low-resolution render without
// resampling a tiny system font inside a mostly empty large texture.
const glyphs: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '111/010/010/010/010/010/111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '010/110/010/010/010/010/111',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
  '/': '00001/00001/00010/00100/01000/10000/10000',
  ':': '0/1/1/0/1/1/0',
  ' ': '000/000/000/000/000/000/000',
};
export function signTexture(text: string, ink: string, background: string, padding = 2, aspect = 0) {
  const letters = [...text.toUpperCase()].map((letter) => (glyphs[letter] ?? glyphs[' ']).split('/'));
  const canvas = document.createElement('canvas');
  const textWidth = letters.reduce((sum, rows) => sum + rows[0].length + 1, 0) - 1;
  canvas.height = 7 + padding * 2;
  canvas.width = Math.max(textWidth + padding * 2, Math.round(canvas.height * aspect));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  let x = Math.floor((canvas.width - textWidth) / 2);
  for (const rows of letters) {
    rows.forEach((row, y) =>
      [...row].forEach((pixel, offset) => {
        if (pixel === '1') ctx.fillRect(x + offset, padding + y, 1, 1);
      }),
    );
    x += rows[0].length + 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

let nameTagId = 0;
/** Follow the painted sprite through lifts, turns and scaling, including before render. */
export function projectNameTagAnchor(object: THREE.Object3D, floorY: number, camera: THREE.Camera,
  target: THREE.Vector3, localFeet?: THREE.Vector3) {
  if (localFeet) object.localToWorld(target.copy(localFeet));
  else { object.getWorldPosition(target); target.y = floorY; }
  return target.project(camera);
}

export function createNameTag(name: string, working: boolean, parent: HTMLElement) {
  const element = document.createElement('div');
  element.className = 'agent-label';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'agent-name';
  const nameText = document.createElement('span'); nameText.className = 'agent-name-text'; nameText.textContent = name;
  const badge = document.createElement('span'); badge.className = 'agent-level'; badge.hidden = true;
  button.append(nameText);
  const details = document.createElement('div');
  details.className = 'agent-details';
  details.id = `agent-details-${++nameTagId}`;
  details.setAttribute('role', 'tooltip');
  button.setAttribute('aria-describedby', details.id);
  const title = document.createElement('strong');
  title.textContent = name;
  const heading = document.createElement('div'); heading.className = 'agent-detail-heading';
  heading.append(title, badge);
  let portraitKey = '';
  let portrait: HTMLElement | undefined;
  const activity = document.createElement('span');
  activity.className = 'agent-activity';
  activity.textContent = working ? 'working at the station' : 'relaxing in the lounge';
  const source = document.createElement('small');
  source.textContent = 'task details are not available';
  const contributions = document.createElement('div'); contributions.className = 'agent-contributions'; contributions.hidden = true;
  const total = document.createElement('span');
  const progress = document.createElement('progress');
  const nextLevel = document.createElement('span'); nextLevel.className = 'agent-next-level';
  const provenance = document.createElement('small');
  contributions.append(total, progress, nextLevel, provenance);
  const tickets = document.createElement('small'); tickets.className = 'agent-ticket-total'; tickets.hidden = true;
  const thoughtBody = document.createElement('div'); thoughtBody.className = 'agent-thought-body';
  const cardBackdrop = document.createElement('canvas'); cardBackdrop.className = 'agent-card-backdrop'; cardBackdrop.setAttribute('aria-hidden','true');
  const backdropInk = cardBackdrop.getContext('2d'); let sampledAt = -Infinity;
  thoughtBody.append(cardBackdrop, heading, activity, source, contributions, tickets); details.append(thoughtBody);
  details.hidden = true;
  element.append(button, details);
  parent.append(element);
  const events = new AbortController();
  let dismissed = false;
  const show = () => {
    if (!dismissed) details.hidden = false;
  };
  const close = () => {
    details.hidden = true;
  };
  element.addEventListener('pointerenter', show);
  element.addEventListener('pointerleave', () => {
    if (document.activeElement !== button) close();
    dismissed = false;
  });
  button.addEventListener('focus', show);
  button.addEventListener('blur', () => {
    close();
    dismissed = false;
  });
  button.addEventListener('click', () => {
    dismissed = false;
    show();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !details.hidden) {
      close();
      dismissed = true;
    }
  }, { signal: events.signal });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !element.contains(event.target)) close();
  }, { signal: events.signal });
  const point = new THREE.Vector3();
  let labelWidth=0,lastLayout='';
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{labelWidth=element.offsetWidth;lastLayout='';}):undefined;
  resize?.observe(element);
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  return {
    element,
    setAvatar(avatar: AvatarConfig) {
      const key = JSON.stringify(avatar); if (key === portraitKey) return;
      portraitKey = key; portrait?.remove();
      portrait = createProfilePortrait(avatar); heading.prepend(portrait);
    },
    dispose() { resize?.disconnect();events.abort(); element.remove(); },
    setStaffIdentity(name: string, role: string) {
      nameText.textContent = title.textContent = name;
      const identity = document.createElement('div'); identity.className = 'staff-identity';
      const job = document.createElement('span'); job.className = 'staff-job'; job.textContent = role;
      title.replaceWith(identity); identity.append(title, job); source.hidden = true;
    },
    setDetails(name: string, activityText: string, sourceText: string) {
      nameText.textContent = title.textContent = name;
      activity.textContent = activityText; source.textContent = sourceText;
    },
    setContribution(record: ContributionRecord | undefined) {
      badge.hidden = contributions.hidden = !record;
      if (!record) { badge.textContent = ''; return; }
      const rank = contributionLevel(record.mergedPullRequests);
      badge.textContent = `LV ${rank.level}`;
      badge.setAttribute('aria-label', `level ${rank.level}`);
      total.textContent = `${record.mergedPullRequests.toLocaleString('en-US')} ${record.mergedPullRequests === 1 ? 'PR' : 'PRs'} merged`;
      progress.max = rank.required; progress.value = rank.earned;
      progress.setAttribute('aria-label', `Level ${rank.level} progress: ${rank.earned} of ${rank.required} PRs`);
      nextLevel.textContent = `${rank.remaining} ${rank.remaining === 1 ? 'PR' : 'PRs'} to level ${rank.level + 1}`;
      provenance.textContent = `@${record.githubLogin} · checked ${new Date(record.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    },
    setTickets(balance: number | undefined) {
      tickets.hidden = balance === undefined;
      tickets.textContent = balance === undefined ? '' : `${balance.toLocaleString()} tickets collected`;
    },
    setActivity(text: string) {
      if (activity.textContent !== text) activity.textContent = text;
    },
    update(
      object: THREE.Object3D,
      floorY: number,
      camera: THREE.Camera,
      canvas: HTMLCanvasElement,
      visible: boolean,
      occluder?: THREE.Object3D,
      localFeet?: THREE.Vector3,
    ) {
      visible = visible && !object.userData.pickupActive;
      element.hidden = !visible;
      if (!visible) {
        close();lastLayout='';
        return;
      }
      projectNameTagAnchor(object, floorY, camera, point, localFeet);
      // A perspective close-up projects props behind the viewer onto the screen; never place a label for them.
      if (point.z < -1 || point.z > 1) { element.hidden = true; lastLayout = ''; close(); return; }
      const x = ((point.x + 1) * canvas.clientWidth) / 2;
      const y = ((1 - point.y) * canvas.clientHeight) / 2;
      if(!labelWidth)labelWidth=element.offsetWidth;
      occluder?.updateWorldMatrix(true,false);
      const layout=[x,y,point.z,canvas.clientWidth,canvas.clientHeight,labelWidth,
        ...camera.matrixWorld.elements,...(occluder?.matrixWorld.elements??[])].join(',');
      if(details.hidden&&lastLayout===layout)return;
      lastLayout=layout;
      if (occluder) {
        bounds.setFromObject(occluder);
        const depth = bounds.getCenter(corner).project(camera).z;
        if (depth < point.z) {
          let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
          for (const bx of [bounds.min.x, bounds.max.x]) for (const by of [bounds.min.y, bounds.max.y]) for (const bz of [bounds.min.z, bounds.max.z]) {
            corner.set(bx, by, bz).project(camera);
            const px = (corner.x + 1) * canvas.clientWidth / 2, py = (1 - corner.y) * canvas.clientHeight / 2;
            left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
          }
          if (x + labelWidth / 2 > left && x - labelWidth / 2 < right && y + 20 > top && y + 3 < bottom) {
            element.hidden = true;lastLayout=''; close(); return;
          }
        }
      }
      // Anchor to the actual painted boots, including an airborne pose. Lettering stays sharp
      // independently of the intentionally low-resolution room canvas.
      const halfWidth = labelWidth / 2;
      const labelX = Math.max(halfWidth + 4, Math.min(canvas.clientWidth - halfWidth - 4, x));
      element.style.transform = `translate(${Math.round(labelX)}px, ${Math.round(y + 2)}px) translateX(-50%)`;
      details.style.setProperty(
        '--detail-shift',
        `${Math.max(0, 122 - labelX) - Math.max(0, labelX + 122 - canvas.clientWidth)}px`,
      );
      details.dataset.above = String(element.dataset.cardPlacement === 'above-body' || y + (contributions.hidden ? 150 : 265) > canvas.clientHeight);
      // Phone rooms can be shorter than a full contribution card. Keep the
      // existing popup inside the clipped scene, scrolling only if necessary.
      if (!details.hidden) {
        details.style.maxHeight = `${Math.max(90, canvas.clientHeight - 8)}px`;
        details.style.setProperty('--detail-y', '0px');
        const panel = details.getBoundingClientRect(), frame = canvas.getBoundingClientRect();
        const shift = Math.max(frame.top + 4 - panel.top, Math.min(0, frame.bottom - 4 - panel.bottom));
        details.style.setProperty('--detail-y', `${Math.round(shift)}px`);
        // Sample only an open card, at coarse resolution. No full-scene blur pass.
        if (backdropInk && performance.now() - sampledAt > 200) {
          sampledAt = performance.now();
          const rect = thoughtBody.getBoundingClientRect();
          const width = Math.max(1,Math.ceil(rect.width/8)), height = Math.max(1,Math.ceil(rect.height/8));
          if (cardBackdrop.width !== width || cardBackdrop.height !== height) { cardBackdrop.width=width; cardBackdrop.height=height; }
          const sx=canvas.width/frame.width, sy=canvas.height/frame.height;
          backdropInk.imageSmoothingEnabled=true;
          backdropInk.drawImage(canvas,(rect.left-frame.left)*sx,(rect.top-frame.top)*sy,rect.width*sx,rect.height*sy,0,0,width,height);
        }

      }
    },
  };
}
