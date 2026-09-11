import { expect, it } from 'vitest';
import { savedVolume, rememberVolume } from '../client/prototypes/factory25dVolumeMemory';
it('restores each channel independently after muting and reloading',()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 rememberVolume('music',80,storage);rememberVolume('sfx',15,storage);
 rememberVolume('music',0,storage);rememberVolume('sfx',0,storage);
 expect(savedVolume('music',0,storage)).toBe(80);expect(savedVolume('sfx',0,storage)).toBe(15);
});
it('ignores broken storage and invalid saved levels',()=>{
 expect(savedVolume('music',25,{getItem:()=>{throw new Error();}})).toBe(25);
 expect(savedVolume('music',0,{getItem:()=>'-12'})).toBe(40);
 expect(()=>rememberVolume('music',25,{setItem:()=>{throw new Error();}})).not.toThrow();
});
