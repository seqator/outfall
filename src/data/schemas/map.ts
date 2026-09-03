/**
 * Схема карт (`map.*`). Набросок — `engine-architect.md` §3.7 (тайловые
 * слои, сущности, триггеры, спавны, выходы) и §2 (структура `public/data/
 * maps/<id>.json`). Семь локаций и их канонические id — `docs/narrative/
 * world-bible.md` §2 (Труба, Плотина, Оголённая линия, Панели, Гаражи,
 * Санаторий «Волна», НИИ «Биосток») — конкретные `map.*` id присваивает
 * level-designer при наполнении контента (OF-014/015/025).
 *
 * Ссылки `enemySpawns[].enemyId → enemy.*`, `itemPickups[].itemId → item.*`,
 * `npcs[].id → npc.*` (используется в `dialog.npc`), `exits[].toMap → map.*`
 * проверяются кросс-ссылочно в `tools/validate-data.ts`.
 */

import { z } from 'zod';
import { LocalIdSchema, Vector2Schema, namespacedId } from './common';
import { ConditionSchema, EffectSchema } from './rules';

export const NpcSpawnSchema = z.object({
  /** Глобальный id NPC (`npc.*`) — на него ссылаются диалоги (`dialog.npc`). Обязан быть уникален по всем картам. */
  id: namespacedId('npc'),
  nameKey: z.string(),
  position: Vector2Schema,
});
export type NpcSpawn = z.infer<typeof NpcSpawnSchema>;

export const EnemySpawnSchema = z.object({
  id: LocalIdSchema,
  enemyId: namespacedId('enemy'),
  position: Vector2Schema,
  count: z.number().int().positive().default(1),
});
export type EnemySpawn = z.infer<typeof EnemySpawnSchema>;

export const ItemPickupSchema = z.object({
  id: LocalIdSchema,
  itemId: namespacedId('item'),
  position: Vector2Schema,
  count: z.number().int().positive().default(1),
});
export type ItemPickup = z.infer<typeof ItemPickupSchema>;

export const MapTriggerSchema = z.object({
  id: LocalIdSchema,
  position: Vector2Schema,
  radius: z.number().positive(),
  /** true — срабатывает один раз за сохранение (напр. сцены дерзости Акта 1); false — многократно. */
  once: z.boolean().default(true),
  condition: ConditionSchema.optional(),
  effects: z.array(EffectSchema).default([]),
});
export type MapTrigger = z.infer<typeof MapTriggerSchema>;

export const MapExitSchema = z.object({
  id: LocalIdSchema,
  position: Vector2Schema,
  toMap: namespacedId('map'),
  /** Необязательный id точки появления на целевой карте — соответствие точке спавна там не проверяется (не в скоупе OF-009). */
  toSpawnId: LocalIdSchema.optional(),
});
export type MapExit = z.infer<typeof MapExitSchema>;

export const MapLayersSchema = z.object({
  /** Плоские (row-major) массивы индексов тайлов, длина = width × height — проверяется в `superRefine` ниже. */
  ground: z.array(z.number().int().nonnegative()),
  walls: z.array(z.number().int().nonnegative()),
  /** 0 — проходимо, 1 — стена/непроходимая клетка (§3.6 `engine-architect.md`, коллизии по сетке). */
  collision: z.array(z.union([z.literal(0), z.literal(1)])),
});

export const MapSchema = z
  .object({
    id: namespacedId('map'),
    nameKey: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileset: z.string().min(1),
    layers: MapLayersSchema,
    npcs: z.array(NpcSpawnSchema).default([]),
    enemySpawns: z.array(EnemySpawnSchema).default([]),
    itemPickups: z.array(ItemPickupSchema).default([]),
    triggers: z.array(MapTriggerSchema).default([]),
    exits: z.array(MapExitSchema).default([]),
  })
  .superRefine((map, ctx) => {
    const expected = map.width * map.height;
    for (const [layer, cells] of Object.entries(map.layers)) {
      if (cells.length !== expected) {
        ctx.addIssue({
          code: 'custom',
          message: `layers.${layer} длиной ${cells.length}, ожидалось width×height = ${expected}`,
          path: ['layers', layer],
        });
      }
    }
  });

export type Map = z.infer<typeof MapSchema>;
