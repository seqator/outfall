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

/** Ключ локализации, напр. `dlg.doc.intro.01`. */
export const I18nKeySchema = z.string().regex(/^[a-z][a-z0-9_.]*$/);

export const Vector2Schema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Id = z.infer<typeof IdSchema>;
export type I18nKey = z.infer<typeof I18nKeySchema>;
export type Vector2 = z.infer<typeof Vector2Schema>;
