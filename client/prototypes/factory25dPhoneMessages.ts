import type { AvatarConfig, ChatMessage } from '@shared/types';
import { createChatMessage } from '../ui/chatMessage';
import { createProfilePortrait } from './factory25dPortrait';

export function createPhoneMessage(message: ChatMessage, ownUsername: string | undefined,
  avatar: AvatarConfig | undefined) {
  const row = createChatMessage(message);
  if (message.username === 'system') return row;
  row.dataset.own = String(!!ownUsername && message.username.toLowerCase() === ownUsername.toLowerCase());
  const name = row.querySelector('.chat-name')!, text = row.querySelector('.chat-text')!, time = row.querySelector('.chat-time')!;
  const portrait = avatar ? createProfilePortrait(avatar) : document.createElement('span');
  if (!avatar) { portrait.className = 'phone-avatar-fallback'; portrait.textContent = message.username.slice(0, 1).toUpperCase(); portrait.setAttribute('aria-hidden', 'true'); }
  const content = document.createElement('div'); content.className = 'phone-message-content';
  content.append(name, text, time); row.replaceChildren(portrait, content); return row;
}
