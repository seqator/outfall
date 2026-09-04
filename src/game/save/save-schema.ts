/**
 * Zod-схема слота сохранения (OF-019, `docs/tech/architecture.md` §8).
 *
 * Сохраняем ровно то, что нужно, чтобы продолжить игру, а не весь мир
 * целиком — так и предписывает задача: «НЕ обязательно сериализовывать
 * всех ECS-сущностей врагов один в один (это сложно и не критично для
 * вертикального среза)». Минимум — герой (позиция/здоровье/оружие/боевые
 * статы, `sim/components/*`, OF-016), инвентарь (`game/inventory`, OF-017),
 * флаги и стадии квестов (`game/quest/quest-state.ts`, `game/dialogue/
 * interpreter.ts`, OF-018), seed RNG и тик мира.
 *
 * Допущение (расхождение критерия готовности и текста задачи, см. отчёт):
 * формулировка критерия «бой продолжается (HP/позиция врагов сохранены)»
 * читается буквально как «сохраняются враги», но abzac задачи прямо выше
 * разрешает НЕ сериализовывать врагов поодиночке — этот файл следует
 * явному разрешению, а не двусмысленному критерию: слот хранит только
 * героя. Раунд-трип и «бой продолжается» проверяются со стороны героя
 * (позиция/HP/боеприпасы/КД рывка) — этого достаточно, чтобы после загрузки
 * продолжить сражаться теми же системами `sim`.
 */

import { z } from 'zod';
import type { FlagValue } from '../../data/schemas/rules';
import { WEAPON_SLOT_ORDER, type WeaponId } from '../../sim';
import { EQUIPMENT_SLOT_IDS, type EquipmentSlotId } from '../inventory/types';

/** Текущая версия формата сейва. См. `migrations.ts` — переходы от более старых версий. */
export const CURRENT_SAVE_SCHEMA_VERSION = 2 as const;

// ---------------------------------------------------------------------------
// Инвентарь (форма зеркалит `src/game/inventory/types.ts`, без импорта его
// рантайм-функций — сюда нужны только данные).
// ---------------------------------------------------------------------------

const InventoryStackSaveSchema = z.object({
  uid: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  decayRemainingMs: z.number().nonnegative().optional(),
});
export type InventoryStackSave = z.infer<typeof InventoryStackSaveSchema>;

const EQUIPMENT_SLOT_ID_TUPLE = EQUIPMENT_SLOT_IDS as [EquipmentSlotId, ...EquipmentSlotId[]];
export const SaveEquipmentSlotIdSchema = z.enum(EQUIPMENT_SLOT_ID_TUPLE);

/** `Partial<Record<EquipmentSlotId, InventoryStack>>` — все 5 слотов необязательны. */
const EquipmentSaveSchema = z.object(
  Object.fromEntries(
    EQUIPMENT_SLOT_ID_TUPLE.map((slot) => [slot, InventoryStackSaveSchema.optional()] as const),
  ) as Record<EquipmentSlotId, z.ZodOptional<typeof InventoryStackSaveSchema>>,
);

const InventorySaveSchema = z.object({
  // `.readonly()` — форма поля один в один с `InventoryState.backpack`
  // (`game/inventory/types.ts`, `readonly InventoryStack[]`), чтобы
  // реальное `InventoryState` можно было положить в `SaveState.inventory`
  // без приведения типов.
  backpack: z.array(InventoryStackSaveSchema).readonly(),
  equipment: EquipmentSaveSchema,
  wallet: z.number().nonnegative(),
});
export type InventorySave = z.infer<typeof InventorySaveSchema>;

// ---------------------------------------------------------------------------
// Оружие героя (форма зеркалит `WeaponsComponent`/`WeaponRuntimeState` из
// `src/sim/components`, `src/sim/formulas/weapons.ts`).
// ---------------------------------------------------------------------------

const WEAPON_ID_TUPLE = WEAPON_SLOT_ORDER as [WeaponId, ...WeaponId[]];
export const SaveWeaponIdSchema = z.enum(WEAPON_ID_TUPLE);

const WeaponRuntimeStateSaveSchema = z.object({
  ammo: z.number().int().nonnegative(),
  cooldownMs: z.number().nonnegative(),
  reloadRemainingMs: z.number().nonnegative(),
  comboHits: z.number().int().nonnegative(),
  /** `EntityId | null` в живом мире — сейв хранит его как есть; после `load()` цель комбо почти наверняка мертва/пересоздана, `combatSystem` это переживает так же, как переживает `alive()` для устаревшего id (см. `core/world.ts`). */
  comboTargetId: z.number().int().nonnegative().nullable(),
});
export type WeaponRuntimeStateSave = z.infer<typeof WeaponRuntimeStateSaveSchema>;

const WeaponStatesSaveSchema = z.object(
  Object.fromEntries(
    WEAPON_ID_TUPLE.map((id) => [id, WeaponRuntimeStateSaveSchema] as const),
  ) as Record<WeaponId, typeof WeaponRuntimeStateSaveSchema>,
);

const WeaponsSaveSchema = z.object({
  equipped: SaveWeaponIdSchema,
  states: WeaponStatesSaveSchema,
});
export type WeaponsSave = z.infer<typeof WeaponsSaveSchema>;

// ---------------------------------------------------------------------------
// Герой: позиция + боевые компоненты, которых достаточно, чтобы `sim`
// продолжил бой теми же формулами после загрузки (`docs/design/combat.md`).
// ---------------------------------------------------------------------------

const HeroSaveSchema = z.object({
  x: z.number(),
  y: z.number(),
  hp: z.number().nonnegative(),
  maxHp: z.number().positive(),
  armor: z.number().nonnegative(),
  facing: z.object({ dirX: z.number(), dirY: z.number() }),
  attributes: z.object({ courage: z.number(), reflex: z.number() }),
  combatSkills: z.object({ guns: z.number(), heavy: z.number(), fists: z.number() }),
  dashState: z.object({
    iframesRemainingMs: z.number().nonnegative(),
    cooldownRemainingMs: z.number().nonnegative(),
  }),
});
export type HeroSave = z.infer<typeof HeroSaveSchema>;

// ---------------------------------------------------------------------------
// Флаги и стадии квестов (`game/dialogue/interpreter.ts` `GameState.flags`,
// `game/quest/quest-state.ts` `QuestsState`) — «диалог/квест не сбросился».
// ---------------------------------------------------------------------------

const SaveFlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);
const FlagsSaveSchema = z.record(z.string(), SaveFlagValueSchema);

const QuestRuntimeStateSaveSchema = z.object({
  stage: z.string().min(1),
  // `.readonly()` — форма зеркалит `QuestRuntimeState.history` (`game/quest/quest-state.ts`).
  history: z.array(z.string().min(1)).readonly(),
});
const QuestsSaveSchema = z.record(z.string(), QuestRuntimeStateSaveSchema);

// ---------------------------------------------------------------------------
// Слот сохранения целиком.
// ---------------------------------------------------------------------------

export const SaveStateSchema = z.object({
  schemaVersion: z.literal(CURRENT_SAVE_SCHEMA_VERSION),
  /** `Date.now()` на момент сохранения — метаданные для будущего UI списка слотов, не участвует в игровой логике. */
  savedAtMs: z.number().nonnegative(),
  hero: HeroSaveSchema,
  weapons: WeaponsSaveSchema,
  inventory: InventorySaveSchema,
  flags: FlagsSaveSchema,
  quests: QuestsSaveSchema,
  /**
   * Seed детерминированного RNG мира (`core/rng.ts`, `createSeededRng`).
   * Допущение: `SeededRng` не даёт снять/восстановить позицию в потоке
   * (`core/rng.ts` вне зоны этой задачи, менять его нельзя) — после загрузки
   * новый `World` детерминирован от начала последовательности того же
   * `seed`, а не с точной точки, где сейв был сделан. Для вертикального
   * среза (один seed на сцену, `DEV_SEED` в `demo-scene.ts`) это не мешает
   * критерию «бой продолжается»: расхождение потока RNG влияет на будущие
   * броски (крит/разброс), не на восстановленное состояние героя.
   */
  rngSeed: z.number(),
  worldTick: z.number().int().nonnegative(),
});

export type SaveState = z.infer<typeof SaveStateSchema>;

/** Значение поля `flags` в удобном для переиспользования виде (совместимо с `GameState.flags` из `game/dialogue/interpreter.ts`). */
export type SaveFlagValue = FlagValue;
