import { describe, expect, it } from 'vitest';
import { DEV_ITEM_IDS, devArmorSlots, rawDevItems } from '../../../../src/game/inventory/fixtures/dev-items';
import {
  addItem,
  equipItem,
  getItemQuantity,
  removeItem,
  removeItemQuantity,
  unequipItem,
  useConsumable,
} from '../../../../src/game/inventory/inventory';
import { createItemRegistry } from '../../../../src/game/inventory/registry';
import { createEmptyInventory } from '../../../../src/game/inventory/types';

const registry = createItemRegistry(rawDevItems);

describe('game/inventory/inventory: addItem', () => {
  it('создаёт новый стек для первого добавления', () => {
    const outcome = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 40,
      uid: 'stack-1',
    });
    expect(outcome.added).toBe(40);
    expect(outcome.rejected).toBe(0);
    expect(outcome.state.backpack).toEqual([{ uid: 'stack-1', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 40 }]);
  });

  it('доливает существующий стакающийся стек до maxStack (item.stack)', () => {
    const first = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 3,
      uid: 'stack-1',
    });
    const second = addItem(first.state, registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 4,
      uid: 'stack-2',
    });
    // maxStack «Бинта» = 5: 3 + 2 доливается в первый стек, 2 уходят в остаток → отклонены (второй стек не создаётся сверх запроса без вызова).
    expect(second.added).toBe(2);
    expect(second.rejected).toBe(2);
    expect(second.stackUid).toBe('stack-1');
    expect(second.state.backpack).toEqual([{ uid: 'stack-1', itemId: DEV_ITEM_IDS.consBint, quantity: 5 }]);
  });

  it('заводит новый стек, если добавляемое количество не помещается в существующий и не влезает целиком в maxStack', () => {
    const full = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 5,
      uid: 'stack-1',
    }).state;
    const outcome = addItem(full, registry, { itemId: DEV_ITEM_IDS.consBint, quantity: 7, uid: 'stack-2' });
    expect(outcome.added).toBe(5); // новый стек тоже ограничен maxStack=5
    expect(outcome.rejected).toBe(2);
    expect(outcome.state.backpack).toHaveLength(2);
    expect(outcome.state.backpack[1]).toEqual({ uid: 'stack-2', itemId: DEV_ITEM_IDS.consBint, quantity: 5 });
  });

  it('герметичная находка запускает decayRemainingMs = spoilSec × 1000 и никогда не сливается со старым стеком', () => {
    const firstFind = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.findZhgutSealed,
      uid: 'find-1',
    });
    expect(firstFind.state.backpack[0]?.decayRemainingMs).toBe(3_600_000);

    const secondFind = addItem(firstFind.state, registry, {
      itemId: DEV_ITEM_IDS.findZhgutSealed,
      uid: 'find-2',
    });
    expect(secondFind.state.backpack).toHaveLength(2);
    expect(secondFind.state.backpack[1]?.uid).toBe('find-2');
  });

  it('количество по умолчанию — 1', () => {
    const outcome = addItem(createEmptyInventory(), registry, { itemId: DEV_ITEM_IDS.matDetali, uid: 's' });
    expect(outcome.state.backpack[0]?.quantity).toBe(1);
  });
});

describe('game/inventory/inventory: removeItem', () => {
  it('уменьшает количество, не убирая стек, если осталось > 0', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 10,
      uid: 'stack-1',
    }).state;
    const outcome = removeItem(state, 'stack-1', 4);
    expect(outcome.removed).toBe(4);
    expect(outcome.state.backpack[0]?.quantity).toBe(6);
  });

  it('убирает стек целиком при остатке 0', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 5,
      uid: 'stack-1',
    }).state;
    const outcome = removeItem(state, 'stack-1', 5);
    expect(outcome.removed).toBe(5);
    expect(outcome.state.backpack).toEqual([]);
  });

  it('не может удалить больше, чем есть в стеке', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 3,
      uid: 'stack-1',
    }).state;
    const outcome = removeItem(state, 'stack-1', 999);
    expect(outcome.removed).toBe(3);
    expect(outcome.state.backpack).toEqual([]);
  });

  it('неизвестный uid — no-op (removed = 0, то же состояние)', () => {
    const state = createEmptyInventory();
    const outcome = removeItem(state, 'ghost');
    expect(outcome.removed).toBe(0);
    expect(outcome.state).toBe(state);
  });

  it('удаляет предмет прямо из слота экипировки', () => {
    const withPistol = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const equipped = equipItem(withPistol, registry, devArmorSlots, 'pistol-1').state;
    const outcome = removeItem(equipped, 'pistol-1', 1);
    expect(outcome.removed).toBe(1);
    expect(outcome.state.equipment.ranged).toBeUndefined();
  });
});

describe('game/inventory/inventory: getItemQuantity/removeItemQuantity (OF-057 — мост resource-патронов)', () => {
  it('getItemQuantity суммирует количество по всем стекам одного itemId, слоты экипировки не считает', () => {
    const state = {
      ...createEmptyInventory(),
      backpack: [
        { uid: 'a', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 12 },
        { uid: 'b', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 8 },
        { uid: 'c', itemId: DEV_ITEM_IDS.matDetali, quantity: 5 },
      ],
    };
    expect(getItemQuantity(state, DEV_ITEM_IDS.ammo9mm)).toBe(20);
    expect(getItemQuantity(state, DEV_ITEM_IDS.matDetali)).toBe(5);
    expect(getItemQuantity(state, 'item.unknown')).toBe(0);
  });

  it('removeItemQuantity списывает из одного стека, если хватает', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 20,
      uid: 'stack-1',
    }).state;
    const outcome = removeItemQuantity(state, DEV_ITEM_IDS.ammo9mm, 8);
    expect(outcome.removed).toBe(8);
    expect(getItemQuantity(outcome.state, DEV_ITEM_IDS.ammo9mm)).toBe(12);
  });

  it('removeItemQuantity распределяет списание по нескольким стекам одного itemId, в порядке backpack', () => {
    const state = {
      ...createEmptyInventory(),
      backpack: [
        { uid: 'a', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 5 },
        { uid: 'b', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 5 },
      ],
    };
    const outcome = removeItemQuantity(state, DEV_ITEM_IDS.ammo9mm, 8);
    expect(outcome.removed).toBe(8);
    // первый стек выбит полностью (5), второй — на недостающие 3.
    expect(outcome.state.backpack).toEqual([{ uid: 'b', itemId: DEV_ITEM_IDS.ammo9mm, quantity: 2 }]);
  });

  it('removeItemQuantity — запрос больше, чем реально есть: списывает всё, removed < quantity', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      quantity: 3,
      uid: 'stack-1',
    }).state;
    const outcome = removeItemQuantity(state, DEV_ITEM_IDS.ammo9mm, 10);
    expect(outcome.removed).toBe(3);
    expect(outcome.state.backpack).toEqual([]);
  });
});

describe('game/inventory/inventory: equipItem', () => {
  it('экипирует оружие в ranged по branch, определённому автоматически', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const outcome = equipItem(state, registry, devArmorSlots, 'pistol-1');
    expect(outcome.ok).toBe(true);
    expect(outcome.state.equipment.ranged?.uid).toBe('pistol-1');
    expect(outcome.state.backpack).toEqual([]);
  });

  it('экипирует броню в слот по ArmorSlotTable', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.helmetMontyor,
      uid: 'helmet-1',
    }).state;
    const outcome = equipItem(state, registry, devArmorSlots, 'helmet-1');
    expect(outcome.ok).toBe(true);
    expect(outcome.state.equipment.armorHead?.uid).toBe('helmet-1');
  });

  it('stackNotFound — uid отсутствует в вещмешке', () => {
    const outcome = equipItem(createEmptyInventory(), registry, devArmorSlots, 'ghost');
    expect(outcome).toEqual({ state: createEmptyInventory(), ok: false, reason: 'stackNotFound' });
  });

  it('notEquippable — расходник/боеприпас/материал не экипируются', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.ammo9mm,
      uid: 'ammo-1',
    }).state;
    const outcome = equipItem(state, registry, devArmorSlots, 'ammo-1');
    expect(outcome).toEqual({ state, ok: false, reason: 'notEquippable' });
  });

  it('wrongSlot — targetSlot не совпадает с реальным слотом предмета', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const outcome = equipItem(state, registry, devArmorSlots, 'pistol-1', 'melee');
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('wrongSlot');
  });

  it('свап: занятие уже занятого слота отправляет старый предмет в вещмешок (items-economy.md §1.1)', () => {
    const withFirst = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const equippedFirst = equipItem(withFirst, registry, devArmorSlots, 'pistol-1').state;

    // Второе дальнобойное оружие того же branch — переиспользуем «Огрызок» под другим uid для теста свапа.
    const withSecond = addItem(equippedFirst, registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-2',
    }).state;
    const outcome = equipItem(withSecond, registry, devArmorSlots, 'pistol-2');

    expect(outcome.ok).toBe(true);
    expect(outcome.swappedOutUid).toBe('pistol-1');
    expect(outcome.state.equipment.ranged?.uid).toBe('pistol-2');
    expect(outcome.state.backpack.map((s) => s.uid)).toEqual(['pistol-1']);
  });
});

describe('game/inventory/inventory: unequipItem', () => {
  it('снимает предмет обратно в вещмешок', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const equipped = equipItem(state, registry, devArmorSlots, 'pistol-1').state;
    const outcome = unequipItem(equipped, 'ranged');
    expect(outcome.ok).toBe(true);
    expect(outcome.state.equipment.ranged).toBeUndefined();
    expect(outcome.state.backpack.map((s) => s.uid)).toEqual(['pistol-1']);
  });

  it('пустой слот — ok: false, состояние не меняется', () => {
    const state = createEmptyInventory();
    const outcome = unequipItem(state, 'ranged');
    expect(outcome).toEqual({ state, ok: false });
  });
});

describe('game/inventory/inventory: useConsumable', () => {
  it('расходует один экземпляр стека и возвращает использованный Item (для чтения effects вызывающей стороной)', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 2,
      uid: 'bint-1',
    }).state;
    const outcome = useConsumable(state, registry, 'bint-1');
    expect(outcome.ok).toBe(true);
    expect(outcome.item?.id).toBe(DEV_ITEM_IDS.consBint);
    expect(outcome.item?.effects).toEqual([{ op: 'heal', amount: 35 }]);
    expect(outcome.state.backpack).toEqual([{ uid: 'bint-1', itemId: DEV_ITEM_IDS.consBint, quantity: 1 }]);
  });

  it('стек с quantity 1 полностью исчезает из вещмешка после использования', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 1,
      uid: 'bint-1',
    }).state;
    const outcome = useConsumable(state, registry, 'bint-1');
    expect(outcome.ok).toBe(true);
    expect(outcome.state.backpack).toEqual([]);
  });

  it('kind !== "consumable" (например оружие) — ok: false, состояние не меняется', () => {
    const state = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.pistolOgryzok,
      uid: 'pistol-1',
    }).state;
    const outcome = useConsumable(state, registry, 'pistol-1');
    expect(outcome).toEqual({ state, ok: false });
  });

  it('uid не найден в вещмешке — ok: false, состояние не меняется', () => {
    const state = createEmptyInventory();
    const outcome = useConsumable(state, registry, 'missing');
    expect(outcome).toEqual({ state, ok: false });
  });
});
