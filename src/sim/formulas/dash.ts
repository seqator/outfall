/**
 * Рывок (`docs/design/combat.md` §4.4):
 * `Iframes(мс) = clamp(120, 200, 120 + 8 × Острота)`, `ОткатРывка = 0,8 с`
 * фиксирован и от статов не зависит.
 */

/** Откат рывка, мс — фиксирован (не зависит от статов, см. §4.4). */
export const DASH_COOLDOWN_MS = 800;

const IFRAMES_MIN_MS = 120;
const IFRAMES_MAX_MS = 200;
const IFRAMES_BASE_MS = 120;
const IFRAMES_PER_REFLEX = 8;

/** `Острота` — характеристика КОСТЯК, 1–10. */
export function computeIframesMs(reflex: number): number {
  const raw = IFRAMES_BASE_MS + IFRAMES_PER_REFLEX * reflex;
  return Math.min(IFRAMES_MAX_MS, Math.max(IFRAMES_MIN_MS, raw));
}
