/**
 * Подбор предметов с карты (`GameMap.itemPickups`, `src/data/schemas/map.ts`)
 * — OF-058, закрывает P0-4/P2-1 баланс-прохода (`docs/qa/balance-report.md`,
 * `docs/qa/vs-report.md`): до этой правки `itemPickups[]` были физически
 * декоративны — `demo-scene.ts` только уничтожал их ECS-метки при переходе
 * между картами (`switchMap`), герой никогда реально не получал предмет в
 * инвентарь.
 *
 * Чистая функция (данные → данные, без DOM/ECS/RNG), тем же принципом, что
 * `world/triggers.ts` (`TriggerRunner.update`) и `game/inventory/inventory.ts`
 * (заголовок того файла): на вход — текущее положение героя, список точек
 * лута карты, уже собранные флаги и инвентарь; на выход — новое состояние
 * инвентаря/флагов и список `id` точек, собранных именно в этом вызове.
 * ECS-часть (уничтожение `spawnMarker`-сущности на карте) — обязанность
 * `demo-scene.ts` (единственный слой, у которого есть `World`), не этого
 * модуля.
 *
 * Подбор — автоматический при подходе (радиус, без отдельной клавиши):
 * `[E]` уже занята диалогами/интеракцией NPC (`INTERACT_RADIUS`,
 * `findNearestInteractableNpc`, `demo-scene.ts`) — совмещать точку лута и
 * NPC-интеракцию на одной клавише усложнило бы взаимодействие без выигрыша
 * (лут не требует диалога/подтверждения, herою просто нужно дойти).
 *
 * Персистентность между заходами на одну и ту же карту (`switchMap` туда-
 * обратно не должен снова выдавать уже подобранный предмет) — через
 * `GameState.flags` (тот же принцип, что `ONE_SHOT_DIALOG_RESOLVED_FLAG` в
 * `demo-scene.ts` уже применяет к необратимым диалогам): `itemPickupFlagKey`
 * даёт уникальный ключ на пару «карта × локальный id точки лута»
 * (`ItemPickup.id` уникален только в пределах одной карты, `LocalIdSchema`),
 * не просто на `pickup.id` — иначе две разные карты с одинаковым локальным
 * именем точки лута (например, `pickup_ammo_1` на нескольких картах) делили
 * бы один и тот же флаг.
 */

import type { Vector2 } from '../../data/schemas';
import type { FlagValue } from '../../data/schemas/rules';
import { addItem, type ItemRegistry, type InventoryState } from '../inventory';

/** Минимальная форма точки лута, нужная этому модулю — совпадает по полям с `ItemPickup` (`data/schemas/map.ts`), без прямой зависимости от всей `GameMap`. */
export interface ItemPickupPoint {
  readonly id: string;
  readonly itemId: string;
  readonly count: number;
  readonly position: Vector2;
}

/** Ключ флага `GameState.flags`, которым помечается уже собранная точка лута конкретной карты. */
export function itemPickupFlagKey(mapId: string, pickupId: string): string {
  return `flag.pickup:${mapId}:${pickupId}`;
}

export interface CollectItemPickupsInput {
  readonly pickups: readonly ItemPickupPoint[];
  readonly heroPosition: Vector2;
  /** Радиус подбора в тайлах — тот же порядок величины, что `EXIT_RADIUS`/`INTERACT_RADIUS` (`demo-scene.ts`). */
  readonly radius: number;
  readonly mapId: string;
  readonly flags: Readonly<Record<string, FlagValue>>;
  readonly inventoryState: InventoryState;
  readonly registry: ItemRegistry;
  /** Генератор `uid` для нового стека (`nextDevUid` в `demo-scene.ts`) — модуль сам не имеет счётчика/RNG, см. заголовок файла. */
  readonly nextUid: () => string;
}

export interface CollectItemPickupsResult {
  readonly inventoryState: InventoryState;
  readonly flags: Readonly<Record<string, FlagValue>>;
  /** `id` точек лута, реально собранных в этом вызове (в порядке `pickups`) — вызывающая сторона уничтожает их ECS-сущности. */
  readonly collectedIds: readonly string[];
}

/**
 * Раз в кадр (вызывается тем же приёмом, что `TriggerRunner.update`):
 * проверяет каждую ещё не собранную точку лута карты против позиции героя,
 * забирает предмет в инвентарь (`addItem`, уже существующая логика
 * `game/inventory/inventory.ts`) и ставит флаг «собрано». Уже собранные
 * точки (флаг уже `true`) и точки вне радиуса пропускаются без изменений —
 * при отсутствии подбора возвращает те же самые ссылки на `inventoryState`/
 * `flags`, что и на входе (без лишних объектов на каждый кадр, когда
 * собирать нечего — единственная реальная аллокация здесь — пустой
 * `collectedIds`, тот же компромисс, что уже у `TriggerRunner.update`).
 */
export function collectNearbyItemPickups(input: CollectItemPickupsInput): CollectItemPickupsResult {
  let inventoryState = input.inventoryState;
  let flags = input.flags;
  const collectedIds: string[] = [];

  for (const pickup of input.pickups) {
    const flagKey = itemPickupFlagKey(input.mapId, pickup.id);
    if (flags[flagKey] === true) continue;

    const dx = pickup.position.x - input.heroPosition.x;
    const dy = pickup.position.y - input.heroPosition.y;
    if (dx * dx + dy * dy > input.radius * input.radius) continue;

    inventoryState = addItem(inventoryState, input.registry, {
      itemId: pickup.itemId,
      quantity: pickup.count,
      uid: input.nextUid(),
    }).state;
    flags = { ...flags, [flagKey]: true };
    collectedIds.push(pickup.id);
  }

  return { inventoryState, flags, collectedIds };
}
