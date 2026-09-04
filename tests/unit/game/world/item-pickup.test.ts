import { describe, expect, it } from 'vitest';
import { DEV_ITEM_IDS, rawDevItems } from '../../../../src/game/inventory/fixtures/dev-items';
import { createItemRegistry } from '../../../../src/game/inventory/registry';
import { createEmptyInventory } from '../../../../src/game/inventory/types';
import {
  collectNearbyItemPickups,
  itemPickupFlagKey,
  type ItemPickupPoint,
} from '../../../../src/game/world/item-pickup';

const registry = createItemRegistry(rawDevItems);

const PICKUP: ItemPickupPoint = {
  id: 'pickup_bint_test',
  itemId: DEV_ITEM_IDS.consBint,
  count: 2,
  position: { x: 10, y: 10 },
};

function nextUid(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `pickup-uid-${n}`;
  };
}

describe('game/world/item-pickup: collectNearbyItemPickups', () => {
  it('герой вне радиуса — ничего не подбирает, ссылки на state/flags не меняются', () => {
    const inventoryState = createEmptyInventory();
    const flags = {};
    const result = collectNearbyItemPickups({
      pickups: [PICKUP],
      heroPosition: { x: 0, y: 0 },
      radius: 1,
      mapId: 'map.test',
      flags,
      inventoryState,
      registry,
      nextUid: nextUid(),
    });
    expect(result.collectedIds).toEqual([]);
    expect(result.inventoryState).toBe(inventoryState);
    expect(result.flags).toBe(flags);
  });

  it('герой в радиусе — предмет реально попадает в инвентарь, ставится флаг «собрано»', () => {
    const result = collectNearbyItemPickups({
      pickups: [PICKUP],
      heroPosition: { x: 10, y: 10 },
      radius: 1,
      mapId: 'map.test',
      flags: {},
      inventoryState: createEmptyInventory(),
      registry,
      nextUid: nextUid(),
    });
    expect(result.collectedIds).toEqual(['pickup_bint_test']);
    expect(result.inventoryState.backpack).toEqual([
      { uid: 'pickup-uid-1', itemId: DEV_ITEM_IDS.consBint, quantity: 2 },
    ]);
    expect(result.flags[itemPickupFlagKey('map.test', 'pickup_bint_test')]).toBe(true);
  });

  /**
   * Регрессия P2-1 (`docs/qa/vs-report.md`): одна и та же точка лута не
   * должна выдавать предмет дважды — ни при повторном вызове на том же
   * кадре (что не бывает в реальной сцене, но проверяет чистую логику), ни
   * при повторном заходе героя в радиус в другой раз (`switchMap` туда-
   * обратно на одну и ту же карту, `demo-scene.ts`). Флаг, выставленный
   * первым вызовом, передаётся во второй вызов — тем же способом, что
   * `demo-scene.ts` передаёт актуальный `gameState.flags` каждый кадр.
   */
  it('повторный вызов с уже выставленным флагом «собрано» не даёт предмет второй раз', () => {
    const uidFactory = nextUid();
    const first = collectNearbyItemPickups({
      pickups: [PICKUP],
      heroPosition: { x: 10, y: 10 },
      radius: 1,
      mapId: 'map.test',
      flags: {},
      inventoryState: createEmptyInventory(),
      registry,
      nextUid: uidFactory,
    });
    expect(first.collectedIds).toEqual(['pickup_bint_test']);

    const second = collectNearbyItemPickups({
      pickups: [PICKUP],
      heroPosition: { x: 10, y: 10 },
      radius: 1,
      mapId: 'map.test',
      flags: first.flags,
      inventoryState: first.inventoryState,
      registry,
      nextUid: uidFactory,
    });
    expect(second.collectedIds).toEqual([]);
    // Тот же самый инвентарь, не «ещё раз добавленный» стек — количество не изменилось.
    expect(second.inventoryState).toBe(first.inventoryState);
    expect(second.inventoryState.backpack).toEqual([
      { uid: 'pickup-uid-1', itemId: DEV_ITEM_IDS.consBint, quantity: 2 },
    ]);
  });

  it('itemPickupFlagKey различает одинаковый локальный id точки лута на разных картах', () => {
    expect(itemPickupFlagKey('map.a', 'pickup_x')).not.toBe(itemPickupFlagKey('map.b', 'pickup_x'));
  });

  it('несколько точек лута в радиусе — все собираются за один вызов', () => {
    const second: ItemPickupPoint = { ...PICKUP, id: 'pickup_ammo_test', itemId: DEV_ITEM_IDS.ammo9mm, count: 8 };
    const result = collectNearbyItemPickups({
      pickups: [PICKUP, second],
      heroPosition: { x: 10, y: 10 },
      radius: 1,
      mapId: 'map.test',
      flags: {},
      inventoryState: createEmptyInventory(),
      registry,
      nextUid: nextUid(),
    });
    expect(result.collectedIds).toEqual(['pickup_bint_test', 'pickup_ammo_test']);
    expect(result.inventoryState.backpack).toHaveLength(2);
  });
});
