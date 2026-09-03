/**
 * Переходы состояния инвентаря (OF-017): добавление/удаление предметов,
 * экипировка/снятие в 5 слотов (`docs/design/items-economy.md` §1.1). Чистые
 * функции: принимают `InventoryState` и возвращают новый `InventoryState`,
 * ничего не мутируют и не трогают DOM/`Date.now()`/RNG — вызывающая сторона
 * (`game`-оркестрация) сама решает, откуда брать `uid` новых стеков.
 */

import { requireItem, type ItemRegistry } from './registry';
import { resolveEquipmentSlot, type ArmorSlotTable } from './equip-slots';
import type { EquipmentSlotId, InventoryStack, InventoryState } from './types';

function replaceBackpack(
  state: InventoryState,
  backpack: readonly InventoryStack[],
): InventoryState {
  return { ...state, backpack };
}

// ---------------------------------------------------------------------------
// Добавление / удаление
// ---------------------------------------------------------------------------

export interface AddItemOutcome {
  readonly state: InventoryState;
  /** Сколько единиц реально легло в стек (существующий или новый). */
  readonly added: number;
  /**
   * Сколько единиц не поместилось (запрошено больше, чем осталось места в
   * одном стеке до `item.stack`) — вызывающая сторона может позвать
   * `addItem` ещё раз с новым `uid`, чтобы завести второй стек.
   */
  readonly rejected: number;
  /** `uid` стека, принявшего добавление (существующего или только что созданного). */
  readonly stackUid: string;
}

export interface AddItemInput {
  readonly itemId: string;
  readonly quantity?: number;
  /** `uid` нового стека, если для добавления придётся завести стек — генерируется вызывающей стороной. */
  readonly uid: string;
}

/**
 * Добавляет предмет в вещмешок. Сначала пытается долить существующий
 * нераспадающийся стек того же `itemId` до `item.stack` (лимит стека из
 * `ItemSchema`), остаток кладёт в новый стек с переданным `uid` (тоже не
 * больше `item.stack`). Герметичные находки (`item.spoilSec` задан) никогда
 * не сливаются с другим стеком — у каждой свой независимый таймер распада
 * (`items-economy.md` §3), запускаемый прямо здесь: «открыл — таймер пошёл».
 */
export function addItem(
  state: InventoryState,
  registry: ItemRegistry,
  input: AddItemInput,
): AddItemOutcome {
  const item = requireItem(registry, input.itemId);
  const quantity = input.quantity ?? 1;
  const maxStack = item.stack;
  const decaying = item.spoilSec !== undefined;

  let remaining = quantity;
  let backpack = state.backpack;
  let stackUid = input.uid;

  if (!decaying && maxStack > 1) {
    const targetIndex = backpack.findIndex(
      (s) => s.itemId === input.itemId && s.decayRemainingMs === undefined && s.quantity < maxStack,
    );
    if (targetIndex !== -1) {
      const target = backpack[targetIndex];
      if (target) {
        const room = maxStack - target.quantity;
        const fill = Math.min(room, remaining);
        if (fill > 0) {
          const updated = { ...target, quantity: target.quantity + fill };
          backpack = backpack.map((s, i) => (i === targetIndex ? updated : s));
          remaining -= fill;
          stackUid = target.uid;
        }
      }
    }
  }

  let added = quantity - remaining;
  if (remaining > 0) {
    const newQuantity = Math.min(remaining, maxStack);
    const newStack: InventoryStack = {
      uid: input.uid,
      itemId: input.itemId,
      quantity: newQuantity,
      ...(decaying ? { decayRemainingMs: (item.spoilSec ?? 0) * 1000 } : {}),
    };
    backpack = [...backpack, newStack];
    added += newQuantity;
    remaining -= newQuantity;
    stackUid = input.uid;
  }

  return {
    state: replaceBackpack(state, backpack),
    added,
    rejected: remaining,
    stackUid,
  };
}

export interface RemoveItemOutcome {
  readonly state: InventoryState;
  /** Сколько реально удалено (может быть меньше запроса, если в стеке не хватало). */
  readonly removed: number;
}

/** Ищет стек по `uid` в вещмешке или в слоте экипировки; возвращает откуда именно. */
function findStack(
  state: InventoryState,
  uid: string,
): { location: 'backpack' | EquipmentSlotId; stack: InventoryStack } | undefined {
  const backpackStack = state.backpack.find((s) => s.uid === uid);
  if (backpackStack) return { location: 'backpack', stack: backpackStack };
  for (const slotId of Object.keys(state.equipment) as EquipmentSlotId[]) {
    const slotStack = state.equipment[slotId];
    if (slotStack && slotStack.uid === uid) return { location: slotId, stack: slotStack };
  }
  return undefined;
}

/**
 * Удаляет `quantity` единиц стека `uid` (из вещмешка или, если предмет
 * экипирован, прямо из слота — например, продажа надетой брони). Стек с
 * количеством 0 после удаления исчезает целиком.
 */
export function removeItem(state: InventoryState, uid: string, quantity = 1): RemoveItemOutcome {
  const found = findStack(state, uid);
  if (!found) return { state, removed: 0 };

  const removed = Math.min(quantity, found.stack.quantity);
  const nextQuantity = found.stack.quantity - removed;

  if (found.location === 'backpack') {
    const backpack =
      nextQuantity > 0
        ? state.backpack.map((s) => (s.uid === uid ? { ...s, quantity: nextQuantity } : s))
        : state.backpack.filter((s) => s.uid !== uid);
    return { state: replaceBackpack(state, backpack), removed };
  }

  const slotId = found.location;
  const equipment = { ...state.equipment };
  if (nextQuantity > 0) {
    equipment[slotId] = { ...found.stack, quantity: nextQuantity };
  } else {
    delete equipment[slotId];
  }
  return { state: { ...state, equipment }, removed };
}

// ---------------------------------------------------------------------------
// Экипировка
// ---------------------------------------------------------------------------

export type EquipFailureReason = 'stackNotFound' | 'notEquippable' | 'wrongSlot';

export interface EquipOutcome {
  readonly state: InventoryState;
  readonly ok: boolean;
  readonly reason?: EquipFailureReason;
  /** `uid` предмета, который был в слоте раньше и уехал в вещмешок (свап), если был. */
  readonly swappedOutUid?: string;
}

/**
 * Переносит стек `uid` из вещмешка в слот экипировки. Слот определяется
 * автоматически по предмету (`resolveEquipmentSlot`); `targetSlot`, если
 * передан, должен совпасть — иначе `wrongSlot` (защита от UI-ошибки, а не
 * основной путь). Если слот уже занят — прежний предмет уходит в вещмешок
 * (свап), как описано в `items-economy.md` §1.1: «попытка занять 2-й слот
 * без снятия первого — блокируется UI, предмет уходит в вещмешок».
 */
export function equipItem(
  state: InventoryState,
  registry: ItemRegistry,
  armorSlots: ArmorSlotTable,
  uid: string,
  targetSlot?: EquipmentSlotId,
): EquipOutcome {
  const backpackStack = state.backpack.find((s) => s.uid === uid);
  if (!backpackStack) return { state, ok: false, reason: 'stackNotFound' };

  const item = requireItem(registry, backpackStack.itemId);
  const slot = resolveEquipmentSlot(item, armorSlots);
  if (!slot) return { state, ok: false, reason: 'notEquippable' };
  if (targetSlot && targetSlot !== slot) return { state, ok: false, reason: 'wrongSlot' };

  const previous = state.equipment[slot];
  const backpackWithoutMoved = state.backpack.filter((s) => s.uid !== uid);
  const backpack = previous ? [...backpackWithoutMoved, previous] : backpackWithoutMoved;

  return {
    state: {
      ...state,
      backpack,
      equipment: { ...state.equipment, [slot]: backpackStack },
    },
    ok: true,
    ...(previous ? { swappedOutUid: previous.uid } : {}),
  };
}

export interface UnequipOutcome {
  readonly state: InventoryState;
  readonly ok: boolean;
}

/** Снимает предмет из слота `slot` обратно в вещмешок. */
export function unequipItem(state: InventoryState, slot: EquipmentSlotId): UnequipOutcome {
  const current = state.equipment[slot];
  if (!current) return { state, ok: false };

  const equipment = { ...state.equipment };
  delete equipment[slot];

  return {
    state: { ...state, equipment, backpack: [...state.backpack, current] },
    ok: true,
  };
}
