export type PrimaryVideoCandidate = {
  id: string;
  width: number;
  height: number;
  paused: boolean;
  ended: boolean;
  visible: boolean;
  focusedBoost?: number;
};

function area(c: PrimaryVideoCandidate): number {
  return Math.max(0, c.width) * Math.max(0, c.height);
}

function score(c: PrimaryVideoCandidate): number {
  if (!c.visible || c.ended) return -1;
  let s = area(c);
  if (!c.paused) s += 1_000_000_000;
  s += (c.focusedBoost ?? 0) * 10_000;
  // Prefer reasonable main sizes over tiny thumbs when both paused.
  if (c.width < 16 || c.height < 16) s -= 1_000_000;
  return s;
}

export function pickPrimaryVideo(
  candidates: PrimaryVideoCandidate[]
): PrimaryVideoCandidate | null {
  if (!candidates.length) return null;
  const visible = candidates.filter((c) => c.visible && !c.ended);
  const pool = visible.length > 0 ? visible : candidates.filter((c) => !c.ended);
  if (!pool.length) return null;
  return pool.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}
