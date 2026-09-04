/**
 * Разброс (`docs/design/combat.md` §4.3):
 * `Разброс° = БазовыйКонус × max(0,4; 1 − 0,007 × Навык) × КоэфДвижения`.
 */

export interface SpreadParams {
  /** Базовый конус оружия, градусы (таблица §3). */
  readonly baseConeDeg: number;
  /** Соответствующий боевой навык, 0–100. */
  readonly skill: number;
  /** true — зажаты клавиши движения; false — стоя ≥ 0,3 с. */
  readonly moving: boolean;
  /** КоэфДвижения на бегу: 1,6 стандартно, 1,3 для «Огрызка» (§3.1). Не используется, если `moving = false`. */
  readonly moveCoef?: number;
}

const SKILL_COEF = 0.007;
const SKILL_COEF_MIN = 0.4;
const DEFAULT_MOVE_COEF = 1.6;

export function computeSpreadDeg(params: SpreadParams): number {
  const { baseConeDeg, skill, moving, moveCoef = DEFAULT_MOVE_COEF } = params;
  const skillCoef = Math.max(SKILL_COEF_MIN, 1 - SKILL_COEF * skill);
  const movementCoef = moving ? moveCoef : 1;
  return baseConeDeg * skillCoef * movementCoef;
}
