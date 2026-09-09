/** Generate once and reuse the SAME synthetic snapshot for both builds. */
import { StateManager } from '../../server/state.js';
import { DEFAULT_AVATAR } from '../../shared/constants.js';
import { writeFile } from 'node:fs/promises';
const output = process.argv[2];
if (!output) throw new Error('Usage: node --import tsx scripts/performance/fixture.ts OUTPUT.json');
// Let initial routes finish before either build connects.
const now = Date.now() - 60_000;
const state = new StateManager('factory25d', () => now);
for (let i = 0; i < 18; i++) {
  const hook = { hook_event_name: 'SessionStart' as const, session_id: `benchmark-${i}`, username: `sample ${i + 1}`, ownerId: `benchmark-owner-${i}`, cwd: '/sample/factory', avatar: { ...DEFAULT_AVATAR, hairStyle: i % 8 } };
  state.handleHookEvent(hook);
  state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: i % 2 ? 'Read' : 'Write' });
}
await writeFile(output, JSON.stringify(state.getSnapshot()));
console.log('Saved 18 synthetic agents to', output);
