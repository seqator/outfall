/**
 * Шок (`docs/design/combat.md` §4.6) — без стекания штрафов.
 *
 * ДОПУЩЕНИЕ: `docs/design/rpg-system.md` §1.4 (черновик Твёрдости) даёт иную,
 * зависящую от статов длительность («4с × (1 − 0,05 × Твёрдость)»). Это
 * противоречит `combat.md` §4.6, который явно фиксирует «ровно 4,000 с» и
 * помечает это решением ревью («правка review §2 „духота“» — не давать шоку
 * запускать спираль штрафов). `combat.md` — источник истины для боевых
 * формул (OF-003, эта задача — OF-016 по нему же), поэтому реализована
 * фиксированная длительность без модификатора Твёрдости; вариант из
 * `rpg-system.md` — устаревший черновик, не встроен.
 */

export const SHOCK_THRESHOLD_RATIO = 0.3;
export const SHOCK_DURATION_MS = 4000;
/** −15% скорости передвижения — единственный эффект шока (без штрафа к разбросу/скорострельности/урону, см. §4.6). */
export const SHOCK_SPEED_MULTIPLIER = 0.85;

/** `Триггер: ОдинУдар ≥ 30% × МаксХП игрока`. */
export function shouldTriggerShock(hitDamage: number, maxHp: number): boolean {
  return hitDamage >= maxHp * SHOCK_THRESHOLD_RATIO;
}

export interface ShockState {
  readonly remainingMs: number;
}

/**
 * Применяет попадание к текущему состоянию шока: если удар триггерит шок —
 * таймер сбрасывается на полные `SHOCK_DURATION_MS`, даже если шок уже был
 * активен (не стекается — эффект остаётся тем же −15%, не удваивается,
 * длительность не продлевается сверх 4 с). Если удар не триггерит шок —
 * состояние не меняется (возвращает `current` как есть).
 */
export function applyShockHit(
  current: ShockState | undefined,
  hitDamage: number,
  maxHp: number,
): ShockState | undefined {
  if (shouldTriggerShock(hitDamage, maxHp)) {
    return { remainingMs: SHOCK_DURATION_MS };
  }
  return current;
}

export function advanceShock(state: ShockState, dtSec: number): ShockState {
  return { remainingMs: Math.max(0, state.remainingMs - dtSec * 1000) };
}

export function isShocked(state: ShockState | undefined): boolean {
  return state !== undefined && state.remainingMs > 0;
}
