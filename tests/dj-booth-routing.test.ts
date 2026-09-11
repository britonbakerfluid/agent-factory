import {describe,it,expect} from 'vitest';
import {DJ_BOOTH,clearFactorySegment,routeToStation} from '../shared/factory25d-layout';
describe('DJ booth walking boundary',()=>{
 it.each(['across','front to back'])('routes %s around the whole table',direction=>{
  const {x,z}=DJ_BOOTH;
  const start=direction==='across'?{x:x-1.4,z}:{x,z:z-1.4};
  const end=direction==='across'?{x:x+1.4,z}:{x,z:z+1.4};
  expect(clearFactorySegment(start,end)).toBe(false);
  const path=routeToStation(start,end);
  expect(path.at(-1)).toEqual(end);
  expect(path.length).toBeGreaterThan(1);
  let previous=start;
  for(const next of path){expect(clearFactorySegment(previous,next)).toBe(true);previous=next;}
 });
});
