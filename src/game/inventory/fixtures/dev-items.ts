/**
 * 5–10 тестовых предметов для разработки (OF-017). Подмножество таблицы 30
 * предметов среза (`docs/design/items-economy.md` §4) — не полный список
 * (наполнение всех 30 в `public/data/items.json` не входит в эту задачу).
 * Числа (вес/цена/стек) взяты один в один из таблицы §4, с поправкой на
 * маппинг `kind` — см. допущение в `../registry.ts`.
 *
 * `rawDevItems` — намеренно `unknown[]` (а не `Item[]`): проходит через
 * `createItemRegistry` → `ItemSchema.parse`, как и любой контент из
 * `public/data/**` в проде — фикстура сама себя валидирует при использовании.
 */

import type { ArmorSlotTable } from '../equip-slots';

export const DEV_ITEM_IDS = {
  pistolOgryzok: 'item.weapon_pistol_ogryzok',
  wrenchKran: 'item.weapon_wrench_kran',
  armorVatnik: 'item.armor_vatnik',
  helmetMontyor: 'item.armor_helmet_montyor',
  glovesSvarka: 'item.armor_gloves_svarka',
  consBint: 'item.cons_bint',
  ammo9mm: 'item.ammo_9mm',
  matDetali: 'item.mat_detali',
  findZhgutSealed: 'item.find_zhgut_sealed',
  junkKasha: 'item.junk_kasha',
} as const;

export const rawDevItems: readonly unknown[] = [
  {
    id: DEV_ITEM_IDS.pistolOgryzok,
    nameKey: 'item.weapon_pistol_ogryzok.name',
    descKey: 'item.weapon_pistol_ogryzok.desc',
    kind: 'weapon',
    weight: 1.2,
    value: 180,
    stack: 1,
    weapon: {
      branch: 'guns',
      damage: 8,
      rateMs: 250,
      magazine: 8,
      reloadMs: 1200,
      spreadDeg: 6,
      ammo: 'item.ammo_9mm',
    },
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.wrenchKran,
    nameKey: 'item.weapon_wrench_kran.name',
    descKey: 'item.weapon_wrench_kran.desc',
    kind: 'weapon',
    weight: 2.0,
    value: 90,
    stack: 1,
    weapon: {
      branch: 'fists',
      damage: 18,
      rateMs: 600,
      spreadDeg: 0,
      range: 1.2,
    },
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.armorVatnik,
    nameKey: 'item.armor_vatnik.name',
    descKey: 'item.armor_vatnik.desc',
    kind: 'armor',
    weight: 4.0,
    value: 120,
    stack: 1,
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.helmetMontyor,
    nameKey: 'item.armor_helmet_montyor.name',
    descKey: 'item.armor_helmet_montyor.desc',
    kind: 'armor',
    weight: 1.2,
    value: 90,
    stack: 1,
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.glovesSvarka,
    nameKey: 'item.armor_gloves_svarka.name',
    descKey: 'item.armor_gloves_svarka.desc',
    kind: 'armor',
    weight: 0.5,
    value: 110,
    stack: 1,
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.consBint,
    nameKey: 'item.cons_bint.name',
    descKey: 'item.cons_bint.desc',
    kind: 'consumable',
    weight: 0.6,
    value: 60,
    stack: 5,
    // `docs/design/items-economy.md` §4 №13: «+35 ХП» — OF-058, тот же
    // общий язык эффектов, что и `public/data/items.json`.
    effects: [{ op: 'heal', amount: 35 }],
  },
  {
    id: DEV_ITEM_IDS.ammo9mm,
    nameKey: 'item.ammo_9mm.name',
    descKey: 'item.ammo_9mm.desc',
    kind: 'ammo',
    weight: 0.02,
    value: 4,
    stack: 200,
    effects: [],
  },
  {
    // material (Детали) — ItemKindSchema не знает `material`, см. допущение в ../registry.ts.
    id: DEV_ITEM_IDS.matDetali,
    nameKey: 'item.mat_detali.name',
    descKey: 'item.mat_detali.desc',
    kind: 'junk',
    weight: 0.3,
    value: 5,
    stack: 200,
    effects: [],
  },
  {
    // find (герметичная находка) — ItemKindSchema не знает `find`; распад определяется
    // наличием `spoilSec`, а не `kind` (см. ../decay.ts).
    id: DEV_ITEM_IDS.findZhgutSealed,
    nameKey: 'item.find_zhgut_sealed.name',
    descKey: 'item.find_zhgut_sealed.desc',
    kind: 'junk',
    weight: 0.4,
    value: 70,
    stack: 1,
    spoilSec: 3600,
    effects: [],
  },
  {
    id: DEV_ITEM_IDS.junkKasha,
    nameKey: 'item.junk_kasha.name',
    descKey: 'item.junk_kasha.desc',
    kind: 'junk',
    weight: 0.5,
    value: 1,
    stack: 200,
    effects: [],
  },
];

/** Слоты брони по `id` — см. допущение в `../equip-slots.ts` (`ItemSchema` не хранит слот брони). */
export const devArmorSlots: ArmorSlotTable = new Map([
  [DEV_ITEM_IDS.armorVatnik, 'armorBody'],
  [DEV_ITEM_IDS.helmetMontyor, 'armorHead'],
  [DEV_ITEM_IDS.glovesSvarka, 'utility'],
]);
