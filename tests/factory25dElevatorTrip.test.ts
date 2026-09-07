import {describe,expect,it} from 'vitest';
import {elevatorTrip} from '../client/prototypes/factory25dElevatorTrip';
describe('elevator room transition',()=>{
  it('moves continuously between visible floors in both directions',()=>{
    for(const from of [false,true]) {
      expect(elevatorTrip(759,from,!from).garage).toBe(from);
      expect(elevatorTrip(760,from,!from)).toMatchObject({garage:!from,veil:0,door:0});
      const middle=elevatorTrip(765,from,!from);
      expect(middle.garage01).toBeCloseTo(.5);
      expect(elevatorTrip(1800,from,!from)).toMatchObject({done:true,garage:!from,veil:0,door:0});
      expect(elevatorTrip(1800,from,!from).lift).toBeCloseTo(0);
    }
  });
  it('provides a brief stationary transition for reduced motion',()=>{
    expect(elevatorTrip(109,false,true,true)).toMatchObject({garage:false,veil:1,lift:0,door:0});
    expect(elevatorTrip(110,false,true,true)).toMatchObject({garage:true,veil:1,lift:0,door:0});
    expect(elevatorTrip(240,false,true,true)).toMatchObject({done:true,veil:0});
  });
});
