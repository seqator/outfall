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
 *
 * OF-035: перки «Дублёная шкура» (порог 40% вместо 30%) и «Хладнокровие»
 * (длительность 2 с вместо 4 с, `rpg-system.md` §3) — это не повтор того же
 * противоречия, а осознанное исключение из «фиксированных 4 с», которое сам
 * GDD и предусматривает через перки. `shouldTriggerShock`/`applyShockHit`
 * принимают порог/длительность необязательными параметрами (по умолчанию —
 * прежние константы, старые вызовы не меняют поведение); применяет их
 * `sim/systems/player-damage.ts`, читая эффект перков игрока.
 */

export const SHOCK_THRESHOLD_RATIO = 0.3;
export const SHOCK_DURATION_MS = 4000;
/** −15% скорости передвижения — единственный эффект шока (без штрафа к разбросу/скорострельности/урону, см. §4.6). */
export const SHOCK_SPEED_MULTIPLIER = 0.85;

/** `Триггер: ОдинУдар ≥ ПорогДоли × МаксХП игрока` (по умолчанию 30%, §4.6; перк «Дублёная шкура» поднимает порог до 40%). */
export function shouldTriggerShock(
  hitDamage: number,
  maxHp: number,
  thresholdRatio: number = SHOCK_THRESHOLD_RATIO,
): boolean {
  return hitDamage >= maxHp * thresholdRatio;
}

export interface ShockState {
  readonly remainingMs: number;
}

/**
 * Применяет попадание к текущему состоянию шока: если удар триггерит шок —
 * таймер сбрасывается на полные `durationMs` (по умолчанию `SHOCK_DURATION_MS`),
 * даже если шок уже был активен (не стекается — эффект остаётся тем же
 * −15%, не удваивается, длительность не продлевается сверх заданной). Если
 * удар не триггерит шок — состояние не меняется (возвращает `current` как
 * есть).
 */
export function applyShockHit(
  current: ShockState | undefined,
  hitDamage: number,
  maxHp: number,
  thresholdRatio: number = SHOCK_THRESHOLD_RATIO,
  durationMs: number = SHOCK_DURATION_MS,
): ShockState | undefined {
  if (shouldTriggerShock(hitDamage, maxHp, thresholdRatio)) {
    return { remainingMs: durationMs };
  }
  return current;
}

/**
 * Гарантированный шок независимо от % урона (Энергосбытовец, §2.4
 * combat.md: «гарантированно накладывает статус „Шок“… независимо от %
 * потерянного ХП») — не стекается так же, как обычный триггер (полный
 * сброс таймера на `durationMs`).
 */
export function applyForcedShockHit(durationMs: number = SHOCK_DURATION_MS): ShockState {
  return { remainingMs: durationMs };
}

export function advanceShock(state: ShockState, dtSec: number): ShockState {
  return { remainingMs: Math.max(0, state.remainingMs - dtSec * 1000) };
}

export function isShocked(state: ShockState | undefined): boolean {
  return state !== undefined && state.remainingMs > 0;
}
