import { describe, expect, it } from 'vitest';
import { createItemRegistry } from '../../../../src/game/inventory/registry';
import { createEmptyInventory, type InventoryState } from '../../../../src/game/inventory/types';
import { isOverloaded, totalWeightKg, weightLimitKg } from '../../../../src/game/inventory/weight';

/** Один искусственный предмет ровно 1 кг — чтобы бить границы формулы без завязки на числа фикстур. */
const oneKgRegistry = createItemRegistry([
  {
    id: 'item.test_weight_1kg',
    nameKey: 'item.test_weight_1kg.name',
    descKey: 'item.test_weight_1kg.desc',
    kind: 'junk',
    weight: 1,
    value: 1,
    stack: 999,
    effects: [],
  },
]);

function withBackpackWeight(kg: number): InventoryState {
  return {
    ...createEmptyInventory(),
    backpack: [{ uid: 'stack-1', itemId: 'item.test_weight_1kg', quantity: kg }],
  };
}

describe('game/inventory/weight: weightLimitKg', () => {
  it.each([
    [3, 35],
    [5, 45],
    [8, 60],
    [10, 70],
  ])('Каркас %i → лимит %i кг (items-economy.md §1.2)', (karkas, expected) => {
    expect(weightLimitKg(karkas)).toBe(expected);
  });
});

describe('game/inventory/weight: totalWeightKg', () => {
  it('суммирует вес вещмешка и экипировки', () => {
    const state: InventoryState = {
      backpack: [{ uid: 'a', itemId: 'item.test_weight_1kg', quantity: 3 }],
      equipment: { ranged: { uid: 'b', itemId: 'item.test_weight_1kg', quantity: 2 } },
      wallet: 0,
    };
    expect(totalWeightKg(state, oneKgRegistry)).toBe(5);
  });

  it('валюта (wallet) не участвует в весе', () => {
    const state = { ...createEmptyInventory(), wallet: 999999 };
    expect(totalWeightKg(state, oneKgRegistry)).toBe(0);
  });
});

describe('game/inventory/weight: isOverloaded — бинарный порог без промежуточных ступеней', () => {
  it('45 кг при лимите 45 кг (Каркас 5) — перегруза нет', () => {
    expect(isOverloaded(withBackpackWeight(45), oneKgRegistry, 5)).toBe(false);
  });

  it('46 кг при лимите 45 кг (Каркас 5) — перегруз с первого кг перевеса', () => {
    expect(isOverloaded(withBackpackWeight(46), oneKgRegistry, 5)).toBe(true);
  });
});
