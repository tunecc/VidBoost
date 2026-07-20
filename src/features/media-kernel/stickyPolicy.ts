export const DEFAULT_STICKY_MS = 3000;
export const DEFAULT_RATE_EPSILON = 0.05;
export const DEFAULT_RECONCILE_CAP = 30;

export function shouldReconcileRate(
  actual: number,
  target: number,
  epsilon: number = DEFAULT_RATE_EPSILON
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return false;
  return Math.abs(actual - target) > epsilon;
}

export function clampReconcileCount(count: number, cap: number = DEFAULT_RECONCILE_CAP): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  if (!Number.isFinite(cap) || cap < 0) return 0;
  return Math.min(count, cap);
}
