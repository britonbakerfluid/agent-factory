import * as THREE from 'three';
import { createBasketballVisual } from './factory25dBasketballVisual';
import personalSpace from '../../docs/evidence/changelog/2026-09-10.png';
import island from '../../docs/evidence/changelog/2026-09-08.png';
import roomLife from '../../docs/evidence/changelog/2026-09-07.png';
import garage from '../../docs/evidence/changelog/2026-09-06.png';
import patio from '../../docs/evidence/changelog/2026-09-05.png';

/** Recreated from each release commit; capture provenance lives beside the PNGs. */
const captures: Record<string, {src:string; alt:string; position:string}> = {
  '2026-09-11-games': {src:'',alt:'The current factory basketballs rendered with pixel edges and room lighting',position:'50% 50%'},
  '2026-09-10-personal-space': {src:personalSpace,alt:'The September 10 factory release, with sample agents at their workstations',position:'50% 50%'},
  '2026-09-08-island': {src:island,alt:'The September 8 factory release with the original bottom navigation island',position:'50% 50%'},
  '2026-09-07-room-life': {src:roomLife,alt:'The September 7 factory release with room staff, lighting, and the lounge',position:'50% 50%'},
  '2026-09-06-garage': {src:garage,alt:'The September 6 garage release with four cars and downstairs workstations',position:'50% 50%'},
  '2026-09-05-factory': {src:patio,alt:'The September 5 patio release with its garden terraces and outdoor workstations',position:'50% 50%'},
};
let basketballImage: string | undefined;
function renderBasketballs() {
  if (basketballImage) return basketballImage;
  const renderer = new THREE.WebGLRenderer({antialias:false,alpha:false});
  renderer.setSize(240,120,false); renderer.setPixelRatio(1);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202634');
  scene.add(new THREE.HemisphereLight('#9bb6df','#363453',4.1));
  const light = new THREE.DirectionalLight('#dcecff',.95); light.position.set(-2,4,5); scene.add(light);
  const camera = new THREE.OrthographicCamera(-2,2,1,-1,.1,10); camera.position.set(0,0,5);
  for (const [i,x] of [-1.25,0,1.25].entries()) {
    const ball = createBasketballVisual(scene,.48); ball.position.x=x; ball.rotation.set(.12,i*.65,.08);
  }
  try { renderer.render(scene,camera); basketballImage=renderer.domElement.toDataURL('image/png'); }
  finally {
    scene.traverse(object => { if(object instanceof THREE.Mesh) { object.geometry.dispose(); for(const material of Array.isArray(object.material)?object.material:[object.material]) material.dispose(); } });
    renderer.dispose(); renderer.forceContextLoss();
  }
  return basketballImage!;
}
export function releaseArtwork(id: string) {
  const capture = captures[id];
  if (!capture) return '';
  return `<div class="factory-update-art factory-release-capture${id === '2026-09-11-games' ? ' factory-release-pixel-render' : ' factory-release-historical'}"><img src="${id === '2026-09-11-games' ? renderBasketballs() : capture.src}" alt="${capture.alt}" style="object-position:${capture.position}" loading="lazy" decoding="async" width="${id === '2026-09-11-games' ? 240 : 1398}" height="${id === '2026-09-11-games' ? 120 : 985}"></div>`;
}
