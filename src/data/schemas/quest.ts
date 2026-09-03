/**
 * Схема квестов (`quest.*`). Набросок стадий — `engine-architect.md` §3.7;
 * содержание квестов (акты, точки выбора, концовки) — `docs/narrative/
 * main-quest.md`, ещё не написан (OF-008), поэтому здесь только форма.
 */

import { z } from 'zod';
import { LocalIdSchema, namespacedId } from './common';
import { ConditionSchema, EffectSchema } from './rules';

export const QuestStageSchema = z.object({
  /** Локален внутри квеста (напр. `start`, `found_key`, `done`), не глобальный id. */
  id: LocalIdSchema,
  descKey: z.string(),
  onEnter: z.array(EffectSchema).default([]),
  complete: ConditionSchema,
});
export type QuestStage = z.infer<typeof QuestStageSchema>;

export const QuestSchema = z
  .object({
    id: namespacedId('quest'),
    titleKey: z.string(),
    stages: z.array(QuestStageSchema).min(1),
  })
  .superRefine((quest, ctx) => {
    const seen = new Set<string>();
    quest.stages.forEach((stage, i) => {
      if (seen.has(stage.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `id стадии "${stage.id}" повторяется в квесте "${quest.id}"`,
          path: ['stages', i, 'id'],
        });
      }
      seen.add(stage.id);
    });
  });

export type Quest = z.infer<typeof QuestSchema>;
