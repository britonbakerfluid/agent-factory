import * as THREE from 'three';
import { GARAGE_DRIVE_PROFILES, type GarageDriveCar } from '@shared/factory25d-driving';

/** Visual-only flourish around an authoritative, stationary car pose. */
export function createCarCelebration(cars: Map<string, THREE.Group>) {
  const flames = new Map<string,THREE.Group>();
  const geometry = new THREE.BoxGeometry(1,1,1);
  const orange = new THREE.MeshBasicMaterial({color:'#ff8c28'});
  const core = new THREE.MeshBasicMaterial({color:'#fff1a0'});
  const smooth = (t:number) => {t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
  return {
    update(states: GarageDriveCar[], now: number, reduced: boolean) {
      for(const flame of flames.values()) flame.visible=false;
      for(const state of states) {
        const car=cars.get(state.id); if(!car)continue;
        car.rotation.x=0; car.rotation.z=0;
        for (const child of car.children) if (child.userData.role === 'ground_shadow') child.visible = !state.celebration;
        if(!state.celebration)continue;
        let flame=flames.get(state.id);
        if(!flame) {
          flame=new THREE.Group(); flame.name='celebration-boost'; flame.position.set(0, .28/car.scale.y, -(GARAGE_DRIVE_PROFILES[state.id].length/2+.4)/car.scale.z); car.add(flame); flames.set(state.id,flame);
          for(const side of [-1,1]) {
            const outer=new THREE.Mesh(geometry,orange),inner=new THREE.Mesh(geometry,core);
            outer.position.set(side*.24/car.scale.x,0,0);
            outer.scale.set(.16/car.scale.x,.16/car.scale.y,1.05/car.scale.z);
            inner.position.copy(outer.position); inner.position.z+=.10/car.scale.z;
            inner.scale.set(.09/car.scale.x,.09/car.scale.y,.95/car.scale.z);
            flame.add(outer,inner);
          }
        }
        const elapsed=Math.max(0,(now-state.celebration.startedAt)/1000);
        const settle=1-smooth((elapsed-4.2)/.8), lift=smooth(elapsed/.35)*settle;
        const twist=state.celebration.turn;
        car.position.y+=(reduced ? .12 : .65)*lift;
        car.rotation.y+=reduced ? 0 : twist*settle+Math.round(twist/(Math.PI*2))*Math.PI*2*(1-settle);
        car.rotation.x=(reduced ? .04 : -.25)*lift;
        // Ease back from the equivalent nearest full rotation, avoiding a rewind.
        const roll=twist*.8, rest=Math.round(roll/(Math.PI*2))*Math.PI*2;
        car.rotation.z=reduced ? 0 : roll*settle+rest*(1-settle);
        flame.visible=elapsed<5;
        flame.scale.setScalar((reduced ? .8 : (.88+.12*Math.sin(Math.floor(elapsed*12)*2.1)))*lift);
      }
    },
    dispose() { for(const flame of flames.values())flame.removeFromParent(); geometry.dispose();orange.dispose();core.dispose(); },
  };
}
