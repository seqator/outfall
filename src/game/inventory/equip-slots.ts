/**
 * Определение слота экипировки для предмета (OF-017, `items-economy.md` §1.1).
 * См. допущение о недостающих полях `ItemSchema` в `registry.ts`.
 */

import type { Item, WeaponBranch } from '../../data/schemas';
import type { EquipmentSlotId } from './types';

/** Ветка оружия → слот (`items-economy.md` §1.1: «Оружие дальнее»/«Оружие ближнее»). */
const WEAPON_BRANCH_SLOT: Readonly<Record<WeaponBranch, EquipmentSlotId>> = {
  guns: 'ranged',
  heavy: 'ranged',
  beam: 'ranged',
  fists: 'melee',
  blades: 'melee',
};

/**
 * `id` брони → слот («тело» / «голова» / «обвес»). `ItemSchema` не хранит эту
 * информацию (см. `registry.ts`), поэтому таблица заполняется вручную рядом
 * с фикстурами (`fixtures/dev-items.ts`) для каждого предмета `kind: 'armor'`.
 */
export type ArmorSlotTable = ReadonlyMap<string, EquipmentSlotId>;

/**
 * Слот, в который штатно ложится предмет, либо `null`, если предмет вообще
 * не экипируется (расходники, боеприпасы, лом, ключи — живут только в
 * вещмешке, `items-economy.md` §1.1).
 */
export function resolveEquipmentSlot(item: Item, armorSlots: ArmorSlotTable): EquipmentSlotId | null {
  if (item.kind === 'weapon') {
    return item.weapon ? WEAPON_BRANCH_SLOT[item.weapon.branch] : null;
  }
  if (item.kind === 'armor') {
    return armorSlots.get(item.id) ?? null;
  }
  return null;
}
