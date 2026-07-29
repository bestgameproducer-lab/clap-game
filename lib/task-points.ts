export type TaskPointCategory = 'standard' | 'ceremony' | 'group' | 'upgrade' | 'hidden';

export function recommendedTaskPoints(category: string, roleScope: string, grantsHiddenSpy = false): number {
  if (grantsHiddenSpy) return 3;
  if (category === 'upgrade' || category === 'hidden' || roleScope === 'spy' || roleScope === 'helper') return 2;
  return 1;
}

export function isTaskPointValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3;
}
