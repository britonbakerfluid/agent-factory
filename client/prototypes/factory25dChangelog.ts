/** Curated release notes. Dates are merge dates, not inferred deployment dates.
 * Add new entries first, with a stable id and the PRs that support the copy.
 */
export const factoryChangelog = [
  { id: '2026-09-11-games', date: '2026-09-11', title: 'A little friendly competition',
    summary: 'Challenge a teammate to HORSE, or head to the patio for a round of Duck Hunt.',
    changes: ['Play asynchronous HORSE, including challenges to people who are offline.', 'Duck Hunt now has five waves, three shots per wave, and harder rounds as you progress.', 'Switch destinations mid-trip, with clearer island controls and quieter character throws.'], prs: [46, 47, 48] },
  { id: '2026-09-10-personal-space', date: '2026-09-10', title: 'Give your people some space',
    summary: 'More expressive characters and easier agent controls.',
    changes: ['Characters leave more space around one another, keeping crowded parts of the room easier to read.', 'Pick up and throw characters with expressive airborne movement and a landing animation.', 'Open your profile menu to find an agent, take control, and move around the factory.'], prs: [45] },
  { id: '2026-09-08-island', date: '2026-09-08', title: 'One island. Your whole factory.',
    summary: 'Room navigation, your profile, and audio come together.',
    changes: ['Room navigation, avatar access, sound, and contextual actions now share one bottom island that changes with your activity.', 'Open the lounge DJ to search YouTube, add a song to the shared queue, and see what is playing.', 'Keyboard access and accessible control labels were improved, while each agent session keeps its own project label.'], prs: [41, 42, 44] },
  { id: '2026-09-07-room-life', date: '2026-09-07', title: 'The factory comes to life',
    summary: 'Room staff, shared driving, and recognition for your work.',
    changes: ['Get behind the wheel in the garage, with driving shared across the room so other visitors can see you moving.', 'Active work earns tickets, and GitHub contribution counts give your profile a level alongside your room presence.', 'Daylight changes the mood of the factory, while rain, room staff, and interactive details make the space feel occupied.'], prs: [33, 34, 35, 36, 37] },
  { id: '2026-09-06-garage', date: '2026-09-06', title: 'Going down: the garage',
    summary: 'A new floor to explore.',
    changes: ['The factory gained a connected lower floor. Take the elevator down to explore the garage and return to the workspace.', 'New workstations and interactive room details extend the factory beyond the original main room.'], prs: [32] },
  { id: '2026-09-05-factory', date: '2026-09-05', title: 'Make yourself at home',
    summary: 'Your avatar, your people, and a little fresh air.',
    changes: ['Edit your avatar inside the factory, with your appearance saved to your owner profile.', 'The front desk shows the people connected to the factory and their presence in the shared room.', 'Guest basketball adds a quick break from work. Outside, the patio gained garden terraces, stairs, and rain details.'], prs: [26, 27, 28, 29, 30, 31] },
] as const;
