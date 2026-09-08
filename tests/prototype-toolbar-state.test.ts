import { describe, it, expect } from 'vitest';
import { factoryToolbarState } from '../client/prototypes/factory25dToolbarState';
const base = { connected:true, signedIn:false, owned:0, active:false, pending:false, blocked:false, room:'factory' as const };
describe('persistent factory navigation states', () => {
  it.each(['factory','patio','garage'] as const)('puts connect in the account slot and hides the guest profile in %s', room => {
    expect(factoryToolbarState({...base,room})).toMatchObject({action:'connect',identity:'signed-out',room,primaryDisabled:false,navigationDisabled:false,profileSelected:false,showProfile:false});
  });
  it('allows a signed-in person without agents to customize', () => {
    expect(factoryToolbarState({...base,signedIn:true})).toMatchObject({action:'customize',profileLabel:'Your agents and avatar',showProfile:true});
  });
  it('finds owned agents and releases a controlled one', () => {
    expect(factoryToolbarState({...base,signedIn:true,owned:2})).toMatchObject({action:'find',showPrimary:false,showProfile:true});
    expect(factoryToolbarState({...base,signedIn:true,owned:2,active:true,blocked:true})).toMatchObject({action:'release',primaryDisabled:false,navigationDisabled:true});
  });
  it('names the controlled agent and makes ending control explicit', () => {
    expect(factoryToolbarState({...base,signedIn:true,active:true,controlName:'Briton'})).toMatchObject({controlMode:'active',controlStatus:'controlling',controlName:'Briton',label:'stop controlling'});
    expect(factoryToolbarState({...base,signedIn:true})).toMatchObject({controlMode:'none',controlStatus:''});
    expect(factoryToolbarState({...base,active:true,focused:'avatar'})).toMatchObject({action:'back',controlStatus:''});
  });
  it('lets a pending claim be canceled during a transition', () => {
    expect(factoryToolbarState({...base,pending:true,blocked:true})).toMatchObject({action:'cancel',label:'cancel request',controlStatus:'taking control',primaryDisabled:false});
  });
  it('keeps back and navigation usable inside a close-up', () => {
    expect(factoryToolbarState({...base,focused:'avatar',blocked:true})).toMatchObject({action:'back',primaryDisabled:false,navigationDisabled:false,profileSelected:true});
  });
  it.each(['window','whiteboard','avatar','brand shelf','chat'])('replaces room controls with %s tools', focused => {
    expect(factoryToolbarState({...base,signedIn:true,focused,blocked:true})).toMatchObject({
      action:'back',tools:focused,showRoomTools:false,showProfile:false,primaryDisabled:false,
    });
  });
  it('restores the account and room tools after leaving a close-up', () => {
    expect(factoryToolbarState({...base,signedIn:true,room:'patio'})).toMatchObject({tools:'patio',showRoomTools:true,showProfile:true});
  });
  it('pauses connection actions on network loss while keeping identity and room', () => {
    expect(factoryToolbarState({...base,connected:false,signedIn:true,room:'garage'})).toMatchObject({action:'reconnect',identity:'signed-in',room:'garage',primaryDisabled:true});
  });
  it('prevents room changes during driving or elevator travel', () => {
    expect(factoryToolbarState({...base,blocked:true})).toMatchObject({primaryDisabled:true,navigationDisabled:true,showProfile:false});
  });
});
