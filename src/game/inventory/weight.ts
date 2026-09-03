/**
 * Вес и перегруз (OF-017, `docs/design/items-economy.md` §1.2–1.3).
 * Формулы воспроизведены один в один, покрыты тестами в
 * `tests/unit/game/inventory/weight.test.ts`.
 */

import { requireItem, type ItemRegistry } from './registry';
import type { InventoryState } from './types';

/** `Вес_лимит(кг) = 20 + 5 × Каркас` (`rpg-system.md` §1.1, переиспользовано в `items-economy.md` §1.2). */
const WEIGHT_LIMIT_BASE_KG = 20;
const WEIGHT_LIMIT_PER_KARKAS_KG = 5;

/** Штрафы бинарного перегруза (`items-economy.md` §1.3) — константы для будущего OF-016 (движение/бой). */
export const OVERLOAD_SPEED_MULTIPLIER = 0.8;
export const OVERLOAD_SPREAD_MULTIPLIER = 1.2;

export function weightLimitKg(karkas: number): number {
  return WEIGHT_LIMIT_BASE_KG + WEIGHT_LIMIT_PER_KARKAS_KG * karkas;
}

/**
 * Суммарный вес всех предметов в 5 слотах экипировки и в вещмешке
 * (`items-economy.md` §1.2). Валюта (`wallet`) весит 0 кг по определению и
 * не участвует — она не предмет `ItemSchema` (см. допущение в `registry.ts`).
 */
export function totalWeightKg(state: InventoryState, registry: ItemRegistry): number {
  let sum = 0;
  for (const stack of state.backpack) {
    sum += requireItem(registry, stack.itemId).weight * stack.quantity;
  }
  for (const slot of Object.values(state.equipment)) {
    if (!slot) continue;
    sum += requireItem(registry, slot.itemId).weight * slot.quantity;
  }
  return sum;
}

/** Бинарный перегруз — без промежуточных ступеней (`items-economy.md` §1.3). */
export function isOverloaded(state: InventoryState, registry: ItemRegistry, karkas: number): boolean {
  return totalWeightKg(state, registry) > weightLimitKg(karkas);
}
