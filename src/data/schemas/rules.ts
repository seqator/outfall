/**
 * Мини-язык условий и эффектов (`docs/planerka/01-concept/engine-architect.md`
 * §3.7): один интерпретатор на диалоги (`dialog.ts`), квесты (`quest.ts`) и
 * триггеры карт (`map.ts`). Здесь — только данные (zod-схема + типы);
 * сам интерпретатор (чистая функция `condition/effect → world`) — зона
 * gameplay-programmer (OF-018).
 *
 * `hasItem`/`giveItem` ссылаются на `item.*`, `questStage`/`startQuest` — на
 * `quest.*`; существование id проверяется кросс-ссылочно в
 * `tools/validate-data.ts`, а не здесь (одна схема не видит другие файлы).
 */

import { z } from 'zod';
import { namespacedId } from './common';
import { SkillKeySchema, StatKeySchema } from './rpg';

const FlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);
export type FlagValue = z.infer<typeof FlagValueSchema>;

const LeafConditionSchema = z.union([
  z.object({
    op: z.literal('hasItem'),
    item: namespacedId('item'),
    count: z.number().int().positive().default(1),
  }),
  z.object({ op: z.literal('flag'), key: z.string().min(1), eq: FlagValueSchema }),
  z.object({ op: z.literal('stat'), stat: StatKeySchema, gte: z.number() }),
  z.object({ op: z.literal('skill'), skill: SkillKeySchema, gte: z.number() }),
  z.object({
    op: z.literal('questStage'),
    quest: namespacedId('quest'),
    stage: z.string().min(1),
    cmp: z.enum(['eq', 'atLeast']).default('atLeast'),
  }),
]);
export type LeafCondition = z.infer<typeof LeafConditionSchema>;

export type Condition =
  | LeafCondition
  | { op: 'all'; conditions: Condition[] }
  | { op: 'any'; conditions: Condition[] }
  | { op: 'not'; condition: Condition };

/** Рекурсивная схема — `all`/`any`/`not` комбинируют условия друг с другом и с листьями выше. */
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    LeafConditionSchema,
    z.object({ op: z.literal('all'), conditions: z.array(ConditionSchema).min(1) }),
    z.object({ op: z.literal('any'), conditions: z.array(ConditionSchema).min(1) }),
    z.object({ op: z.literal('not'), condition: ConditionSchema }),
  ]),
);

export const EffectSchema = z.union([
  z.object({
    op: z.literal('giveItem'),
    item: namespacedId('item'),
    count: z.number().int().positive().default(1),
  }),
  z.object({ op: z.literal('setFlag'), key: z.string().min(1), value: FlagValueSchema }),
  /**
   * Прибавляет `amount` (может быть отрицательным) к текущему числовому
   * значению флага (0, если флага ещё не было или он не число) — в отличие
   * от `setFlag`, не перезаписывает флаг целиком. Нужен для счётчиков,
   * которые меняются несколькими независимыми эффектами за игру, а не
   * задаются один раз (репутация фракций `rep.*`, `docs/narrative/
   * main-quest.md` §0.1 — три квеста Акта 1 независимо трогают один и тот
   * же `rep.progress2`; `setFlag` стирал бы предыдущий вклад вместо
   * накопления).
   */
  z.object({ op: z.literal('incrementFlag'), key: z.string().min(1), amount: z.number() }),
  z.object({ op: z.literal('startQuest'), quest: namespacedId('quest') }),
  z.object({ op: z.literal('damage'), amount: z.number().positive() }),
  z.object({ op: z.literal('xp'), amount: z.number().positive() }),
  /**
   * Лечит `amount` ХП — эффект расходников (`kind: 'consumable'`, напр.
   * `item.cons_bint`, `docs/design/items-economy.md` §4 №13: «+35 ХП»,
   * OF-058). Тем же общим языком, что уже используют диалоги/квесты/
   * триггеры (`walkCondition`/`applyEffects`, заголовок файла) — предмет
   * несёт `effects: [{op:'heal', amount:35}]` вместо отдельного точечного
   * поля `ItemSchema` (альтернатива, которую не выбрали: `healAmount?:
   * number` рядом с `spoilSec`/`weapon` — общий `effects` уже существовал
   * на `ItemSchema` пустым массивом и это тот же интерпретатор, которым уже
   * пользуется остальной контент, лишнее точечное поле было бы дублирующим
   * путём для одной и той же концепции «эффект предмета»). Интерпретатор
   * этого файла (`applyEffect`, `game/dialogue/interpreter.ts`) не имеет
   * доступа к ECS `health`-компоненту героя — там `heal` лишь прибавляет к
   * плоскому `GameState.hp` (тем же способом, что уже `damage`/`xp`, для
   * единообразия интерпретатора). Настоящее лечение ECS-героя при
   * использовании предмета из инвентаря делает `demo-scene.ts` напрямую
   * поверх `health.hp`/`maxHp` — единственный слой, у которого есть и
   * `World`, и `ItemRegistry`/`item.effects` одновременно (см.
   * `useConsumable`, `game/inventory/inventory.ts`).
   */
  z.object({ op: z.literal('heal'), amount: z.number().positive() }),
]);
export type Effect = z.infer<typeof EffectSchema>;

/**
 * Обходит дерево условия и вызывает `visit` для каждого листа — используется
 * `tools/validate-data.ts` для сбора ссылок (`hasItem.item`,
 * `questStage.quest`) без дублирования обхода `all`/`any`/`not` в самом
 * валидаторе.
 */
export function walkCondition(condition: Condition, visit: (leaf: LeafCondition) => void): void {
  switch (condition.op) {
    case 'all':
    case 'any':
      for (const c of condition.conditions) walkCondition(c, visit);
      return;
    case 'not':
      walkCondition(condition.condition, visit);
      return;
    default:
      visit(condition);
  }
}
