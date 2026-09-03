/**
 * Схема предметов (`item.*`). Источники: набросок `ItemSchema` из
 * `docs/planerka/01-concept/engine-architect.md` §3.7, три оружия среза из
 * `docs/design/combat.md` §3 (`item.pistol_ogryzok`, `item.shotgun_duplo`,
 * `item.wrench_kran` — точные id согласует gameplay-programmer/level-designer
 * при наполнении `public/data/items.json`).
 *
 * TODO(OF-007, items-economy.md): экономика (базовые цены, слоты
 * инвентаря, точная таблица «часа до каши») ещё не описана отдельным
 * документом — поля `value`/`spoilSec` здесь заведены по разумному
 * минимуму из концепта и глоссария world-bible («лут на час») и подлежат
 * уточнению, когда появится `docs/design/items-economy.md`.
 */

import { z } from 'zod';
import { namespacedId } from './common';
import { EffectSchema } from './rules';

/** `weapon` заполняется только для `kind: 'weapon'`; ammo не носит `weapon`, но может быть целью `weapon.ammo`. */
export const ItemKindSchema = z.enum(['weapon', 'armor', 'consumable', 'junk', 'key', 'ammo']);
export type ItemKind = z.infer<typeof ItemKindSchema>;

/** Ветка боевого навыка, которой принадлежит оружие (`docs/design/rpg-system.md` §2.1). */
export const WeaponBranchSchema = z.enum(['guns', 'heavy', 'beam', 'fists', 'blades']);
export type WeaponBranch = z.infer<typeof WeaponBranchSchema>;

export const WeaponStatsSchema = z.object({
  branch: WeaponBranchSchema,
  /** База урона до применения формулы `docs/design/combat.md` §4.1/§5. */
  damage: z.number().positive(),
  /** Мс между выстрелами/ударами (§3 `combat.md`: `1000 / скорострельность`). */
  rateMs: z.number().positive(),
  /** Патронов в магазине; отсутствует у оружия без патронов (Кулаки/Ножи). */
  magazine: z.number().int().positive().optional(),
  reloadMs: z.number().nonnegative().optional(),
  /** Базовый конус разброса, градусы (§4.3); 0 — хитскан («Дуга»). */
  spreadDeg: z.number().nonnegative(),
  range: z.number().positive().optional(),
  /** Тип патрона — id предмета с `kind: 'ammo'`, существование проверяет `validate-data`. */
  ammo: namespacedId('item').optional(),
});
export type WeaponStats = z.infer<typeof WeaponStatsSchema>;

export const ItemSchema = z
  .object({
    id: namespacedId('item'),
    nameKey: z.string(),
    descKey: z.string(),
    kind: ItemKindSchema,
    /** Кг, участвует в лимите веса `Вес_лимит = 20 + 5 × Каркас` (`rpg-system.md` §1.1). */
    weight: z.number().nonnegative(),
    /** Базовая цена до модификатора Языка (`rpg-system.md` §1.5); TODO(OF-007) — точные числа. */
    value: z.number().int().nonnegative(),
    stack: z.number().int().positive().default(1),
    weapon: WeaponStatsSchema.optional(),
    /** Эффект при использовании (расходники) — пусто для брони/лута/ключей. */
    effects: z.array(EffectSchema).default([]),
    /** «Час до каши» (world-bible, глоссарий): секунд до порчи после вскрытия; TODO(OF-007) — точное число. */
    spoilSec: z.number().positive().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'weapon' && !item.weapon) {
      ctx.addIssue({
        code: 'custom',
        message: `item "${item.id}": kind "weapon" требует заполненного поля weapon`,
        path: ['weapon'],
      });
    }
  });

export type Item = z.infer<typeof ItemSchema>;
