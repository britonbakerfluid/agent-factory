export * from '@shared/factory25d-layout';
export function isWorking(activity: string) {
  return ['thinking', 'reading', 'writing', 'running', 'searching', 'chatting', 'planning', 'compacting'].includes(activity);
}
