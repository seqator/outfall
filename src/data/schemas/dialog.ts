/**
 * Схема диалогов (`dialog.*`). Набросок узлов/веток — `engine-architect.md`
 * §3.7. `npc` — id персонажа-владельца диалога (`npc.*`); существование
 * ссылается на NPC, размещённого на какой-либо карте (`map.ts`, поле
 * `npcs[].id`) — проверяется кросс-ссылочно в `tools/validate-data.ts`,
 * не здесь.
 */

import { z } from 'zod';
import { LocalIdSchema, namespacedId } from './common';
import { CheckKeySchema } from './rpg';
import { ConditionSchema, EffectSchema } from './rules';

export const DialogChoiceSchema = z.object({
  textKey: z.string(),
  /** `null` — реплика завершает диалог. Иначе — id узла в `nodes` того же диалога. */
  next: LocalIdSchema.nullable(),
  /** Скрывает реплику из списка выбора, если условие не выполнено. */
  condition: ConditionSchema.optional(),
  effects: z.array(EffectSchema).default([]),
  /**
   * Порог, видимый игроку заранее (принцип «честно, без автоприцела»,
   * `rpg-system.md` §1): реплика видна всегда, но помечена как проходящая
   * проверку только если `Характеристика/Навык ≥ dc`.
   */
  check: z.object({ stat: CheckKeySchema, dc: z.number() }).optional(),
});
export type DialogChoice = z.infer<typeof DialogChoiceSchema>;

export const DialogNodeSchema = z.object({
  /** `npc.*`/`player`/`narrator` — свободная строка, не обязана совпадать с `dialog.npc` (второстепенные NPC в сцене). */
  speaker: z.string().min(1),
  textKey: z.string(),
  choices: z.array(DialogChoiceSchema).default([]),
});
export type DialogNode = z.infer<typeof DialogNodeSchema>;

export const DialogSchema = z
  .object({
    id: namespacedId('dialog'),
    /** NPC — владелец диалога; должен существовать среди `npcs` какой-либо карты. */
    npc: namespacedId('npc'),
    start: LocalIdSchema,
    nodes: z.record(LocalIdSchema, DialogNodeSchema),
  })
  .superRefine((dialog, ctx) => {
    if (Object.keys(dialog.nodes).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'dialog.nodes не может быть пустым', path: ['nodes'] });
      return;
    }
    if (!(dialog.start in dialog.nodes)) {
      ctx.addIssue({
        code: 'custom',
        message: `start-узел "${dialog.start}" не найден среди nodes диалога "${dialog.id}"`,
        path: ['start'],
      });
    }
    for (const [nodeId, node] of Object.entries(dialog.nodes)) {
      node.choices.forEach((choice, i) => {
        if (choice.next !== null && !(choice.next in dialog.nodes)) {
          ctx.addIssue({
            code: 'custom',
            message: `узел "${nodeId}" choices[${i}].next → "${choice.next}" не найден среди nodes этого же диалога`,
            path: ['nodes', nodeId, 'choices', i, 'next'],
          });
        }
      });
    }
  });

export type Dialog = z.infer<typeof DialogSchema>;
