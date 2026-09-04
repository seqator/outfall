import { describe, expect, it } from 'vitest';
import { resolveEquipmentSlot, type ArmorSlotTable } from '../../../../src/game/inventory/equip-slots';
import { DEV_ITEM_IDS, devArmorSlots, rawDevItems } from '../../../../src/game/inventory/fixtures/dev-items';
import { createItemRegistry, requireItem } from '../../../../src/game/inventory/registry';

const registry = createItemRegistry(rawDevItems);

describe('game/inventory/equip-slots: resolveEquipmentSlot — оружие', () => {
  it('guns/heavy/beam → ranged', () => {
    for (const branch of ['guns', 'heavy', 'beam'] as const) {
      const item = { ...requireItem(registry, DEV_ITEM_IDS.pistolOgryzok), weapon: { ...requireItem(registry, DEV_ITEM_IDS.pistolOgryzok).weapon!, branch } };
      expect(resolveEquipmentSlot(item, devArmorSlots)).toBe('ranged');
    }
  });

  it('fists/blades → melee', () => {
    for (const branch of ['fists', 'blades'] as const) {
      const item = { ...requireItem(registry, DEV_ITEM_IDS.wrenchKran), weapon: { ...requireItem(registry, DEV_ITEM_IDS.wrenchKran).weapon!, branch } };
      expect(resolveEquipmentSlot(item, devArmorSlots)).toBe('melee');
    }
  });
});

describe('game/inventory/equip-slots: resolveEquipmentSlot — броня', () => {
  it('слот берётся из ArmorSlotTable по id', () => {
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.armorVatnik), devArmorSlots)).toBe('armorBody');
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.helmetMontyor), devArmorSlots)).toBe(
      'armorHead',
    );
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.glovesSvarka), devArmorSlots)).toBe('utility');
  });

  it('броня без записи в таблице — не экипируется (null)', () => {
    const emptyTable: ArmorSlotTable = new Map();
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.armorVatnik), emptyTable)).toBeNull();
  });
});

describe('game/inventory/equip-slots: resolveEquipmentSlot — остальные kind', () => {
  it('consumable/ammo/junk — не экипируются', () => {
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.consBint), devArmorSlots)).toBeNull();
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.ammo9mm), devArmorSlots)).toBeNull();
    expect(resolveEquipmentSlot(requireItem(registry, DEV_ITEM_IDS.matDetali), devArmorSlots)).toBeNull();
  });
});
