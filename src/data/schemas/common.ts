/**
 * Общие zod-примитивы, переиспользуемые остальными схемами контента
 * (`item`, `perk`, `dialog`, `quest`, `map` — задача OF-009).
 *
 * Контент — данные, не код: любой JSON из `public/data/**` проходит через
 * такую схему до попадания в игру (`npm run validate` + проверка при
 * загрузке в проде).
 */

import { z } from 'zod';

/** Идентификатор контента: `namespace.snake_case`, напр. `item.bolt_pistol`. */
export const IdSchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/);

/**
 * Идентификатор контента, ограниченный конкретным пространством имён,
 * напр. `namespacedId('item')` принимает только `item.<name>`.
 * Используется в полях-ссылках (`enemyId`, `itemId`, `quest`, …), чтобы
 * zod уже на уровне схемы отсекал перепутанные типы ссылок, а
 * `tools/validate-data.ts` мог сгруппировать все ссылки по namespace для
 * кросс-ссылочной проверки существования.
 */
export function namespacedId(namespace: string) {
  return IdSchema.refine((v) => v.startsWith(`${namespace}.`), {
    message: `ожидался id вида "${namespace}.<name>", получено "${namespace}" не в начале строки`,
  });
}

/** Локальный идентификатор — уникален только внутри одного файла контента (узел диалога, id спавна на карте и т.п.), без namespace. */
export const LocalIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

/** Ключ локализации, напр. `dlg.doc.intro.01`. */
export const I18nKeySchema = z.string().regex(/^[a-z][a-z0-9_.]*$/);

export const Vector2Schema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Id = z.infer<typeof IdSchema>;
export type LocalId = z.infer<typeof LocalIdSchema>;
export type I18nKey = z.infer<typeof I18nKeySchema>;
export type Vector2 = z.infer<typeof Vector2Schema>;
