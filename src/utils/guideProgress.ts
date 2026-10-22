export type GuideRole = 'customer' | 'merchant' | 'super-admin' | 'verification';

export function getGuideProgressKey(role: GuideRole, accountId?: string | number | null): string {
  const scope = accountId === null || accountId === undefined || accountId === ''
    ? 'default'
    : encodeURIComponent(String(accountId));
  return `matable:guide-progress:${role}:${scope}`;
}

export function parseGuideProgress(value: unknown, validStepIds: readonly string[]): string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const validIds = new Set(validStepIds);
  return [...new Set(parsed.filter((stepId): stepId is string =>
    typeof stepId === 'string' && validIds.has(stepId)))];
}

export function toggleGuideStep(progress: readonly string[], stepId: string): string[] {
  return progress.includes(stepId)
    ? progress.filter((currentStepId) => currentStepId !== stepId)
    : [...progress, stepId];
}
