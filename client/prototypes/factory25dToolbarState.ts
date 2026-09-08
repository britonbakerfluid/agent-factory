import type { FactoryRoom } from '@shared/factory25d-layout';
export type ToolbarAction = 'connect' | 'back' | 'find' | 'release' | 'cancel' | 'customize' | 'reconnect';
export function factoryToolbarState(input: {
  connected: boolean; signedIn: boolean; owned: number; active: boolean; pending: boolean;
  controlName?: string; focused?: string; blocked: boolean; room: FactoryRoom;
}) {
  const action: ToolbarAction = input.focused ? 'back' : input.active ? 'release' : input.pending ? 'cancel'
    : !input.connected ? 'reconnect' : !input.signedIn ? 'connect' : input.owned ? 'find' : 'customize';
  const label = { connect:'connect', back:'back', find:'find mine', release:'stop controlling', cancel:'cancel request', customize:'customize', reconnect:'reconnecting' }[action];
  return {
    action, label, room:input.room,
    reconnecting:!input.connected,
    controlMode:input.active ? 'active' : input.pending ? 'pending' : 'none',
    controlStatus:!input.focused && (input.active || input.pending) ? (input.active ? 'controlling' : 'taking control') : '',
    controlName:input.controlName?.trim() || 'your agent',
    showPrimary:action!=='find'&&action!=='customize',
    identity:input.signedIn ? 'signed-in' : 'signed-out',
    view: input.focused ?? (input.blocked ? 'busy' : input.room),
    primaryDisabled: action === 'reconnect' || input.blocked && !input.focused && !input.active && !input.pending,
    navigationDisabled:input.blocked && !input.focused,
    showRoomTools:!input.focused,
    tools:input.focused ?? (input.blocked ? '' : input.room),
    showProfile:input.signedIn && !input.focused,
    profileSelected:input.focused === 'avatar',
    profileLabel:input.signedIn ? 'Your agents and avatar' : 'Your profile — connect to customize',
  };
}
