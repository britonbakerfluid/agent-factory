import {createTrack, WORLD_SCALE, ROAD_HALF} from './factory25dMotorTrack';

/** One continuous terrain surface: level road bed, then soft cut/fill shoulders. */
export function createRoadGround(naturalHeight:(x:number,z:number)=>number) {
  const track=createTrack((x,z)=>naturalHeight(x/WORLD_SCALE,z/WORLD_SCALE)*WORLD_SCALE);
  const points=track.samples.map(s=>s.p.clone().multiplyScalar(1/WORLD_SCALE));
  const bed=(ROAD_HALF+.9)/WORLD_SCALE;
  const reach=1.25;
  const cells=new Map<string,number[]>();
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    for(let x=Math.floor(Math.min(a.x,b.x)-reach);x<=Math.floor(Math.max(a.x,b.x)+reach);x++)
      for(let z=Math.floor(Math.min(a.z,b.z)-reach);z<=Math.floor(Math.max(a.z,b.z)+reach);z++){
        const key=`${x},${z}`;const entries=cells.get(key)??[];entries.push(i);cells.set(key,entries);
      }
  }
  function nearest(x:number,z:number){
    let distance=Infinity,y=0;
    for(const i of cells.get(`${Math.floor(x)},${Math.floor(z)}`)??[]){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
      const d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
      if(d<distance){distance=d;y=a.y+(b.y-a.y)*t;}
    }
    return {distance,y};
  }
  return {track, distanceAt:(x:number,z:number)=>nearest(x,z).distance,
    heightAt(x:number,z:number){
      const natural=naturalHeight(x,z),near=nearest(x,z);
      if(near.distance>=reach)return natural;
      const t=Math.max(0,Math.min(1,(near.distance-bed)/(reach-bed)));
      const blend=t*t*(3-2*t);
      return (near.y-.003)*(1-blend)+natural*blend;
    }
  };
}
