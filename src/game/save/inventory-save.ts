/**
 * `SaveState.inventory` (`InventorySave`, `save-schema.ts`) → рантайм
 * `InventoryState` (`game/inventory/types.ts`). Формы полей совпадают один в
 * один, но не идентичны по типу: zod `.optional()` даёт `T | undefined`, а
 * `InventoryState` собран под `exactOptionalPropertyTypes: true` — там
 * опциональное поле обязано отсутствовать, а не быть `undefined`-значением.
 * Прямое присваивание `loaded.inventory` в `InventoryState` из-за этого не
 * типизируется — этот модуль строит копию с корректной формой полей.
 */

import { EQUIPMENT_SLOT_IDS, type EquipmentSlotId, type InventoryStack, type InventoryState } from '../inventory/types';
import type { InventorySave, InventoryStackSave } from './save-schema';

function toInventoryStack(save: InventoryStackSave): InventoryStack {
  return {
    uid: save.uid,
    itemId: save.itemId,
    quantity: save.quantity,
    ...(save.decayRemainingMs !== undefined ? { decayRemainingMs: save.decayRemainingMs } : {}),
  };
}

export function toInventoryState(save: InventorySave): InventoryState {
  const equipment: Partial<Record<EquipmentSlotId, InventoryStack>> = {};
  for (const slotId of EQUIPMENT_SLOT_IDS) {
    const stack = save.equipment[slotId];
    if (stack) equipment[slotId] = toInventoryStack(stack);
  }
  return {
    backpack: save.backpack.map(toInventoryStack),
    equipment,
    wallet: save.wallet,
  };
}
