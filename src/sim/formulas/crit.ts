/**
 * Крит (`docs/design/combat.md` §4.2): `ШансКрита = 3% + 1,5% × Кураж`. При
 * попадании в крит — `Крит = 2` (двойной урон); откидывание цели на 0,3 м —
 * забота вызывающей системы (`combatSystem`), не формулы.
 */

import type { SeededRng } from '../../core/rng';

const CRIT_CHANCE_BASE = 0.03;
const CRIT_CHANCE_PER_COURAGE = 0.015;

/** Возвращает долю (0..1), не проценты — `courage` — характеристика КОСТЯК «Кураж», 1–10. */
export function computeCritChance(courage: number): number {
  return CRIT_CHANCE_BASE + CRIT_CHANCE_PER_COURAGE * courage;
}

/**
 * Бросок крита через детерминированный `SeededRng` мира (`world.rng`) — не
 * `Math.random`, чтобы бой оставался воспроизводимым (реплей, ADR-002).
 * Возвращает множитель урона: `2` — крит, `1` — обычное попадание.
 */
export function rollCrit(rng: SeededRng, courage: number): 1 | 2 {
  return rng.next() < computeCritChance(courage) ? 2 : 1;
}
