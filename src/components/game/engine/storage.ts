/**
 * High score persistence. `localStorage` throws in a few real browsers (Safari private mode, an
 * iframe with storage blocked), and the game must keep running when it does — a lost score is not
 * worth a broken hero.
 */
const STORAGE_KEY = 'samnesler:runner:best';

export function loadBest(): number {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Stores `distance` if it beats the stored best. Returns true when it was a new record. */
export function saveBest(distance: number): boolean {
  const best = loadBest();
  const score = Math.max(0, Math.floor(distance));
  if (score <= best) return false;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(score));
  } catch {
    // Storage is unavailable; the score still counts for this session.
  }
  return true;
}
