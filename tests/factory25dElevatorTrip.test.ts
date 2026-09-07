import {describe,expect,it} from 'vitest';
import {elevatorTrip} from '../client/prototypes/factory25dElevatorTrip';
describe('elevator room transition',()=>{
  it.each([false,true])('moves continuously in both directions (passenger: %s)',passenger=>{
    for(const from of [false,true]) {
      const ride=(time:number)=>elevatorTrip(time*(passenger?1:1.35),from,!from,false,passenger);
      expect(ride(759).garage).toBe(from);
      expect(ride(761)).toMatchObject({garage:!from,veil:0,door:0});
      const middle=ride(765);
      expect(middle.garage01).toBeCloseTo(.5);
      expect(ride(1800)).toMatchObject({done:true,garage:!from,veil:0,door:0});
      expect(ride(1800).lift).toBeCloseTo(0);
    }
  });
  it('provides a brief stationary transition for reduced motion',()=>{
    expect(elevatorTrip(109,false,true,true)).toMatchObject({garage:false,veil:1,lift:0,door:0});
    expect(elevatorTrip(110,false,true,true)).toMatchObject({garage:true,veil:1,lift:0,door:0});
    expect(elevatorTrip(240,false,true,true)).toMatchObject({done:true,veil:0});
  });
});
