/**
 * Схема словаря локализации (`public/data/i18n/<locale>.json`) —
 * `engine-architect.md` §3 «Локализация через словарь». Плоский
 * `Record<ключ, строка>`; `ru.json` обязателен, `en.json` — заглушка
 * (риск №8 скоуп-стопа бэклога: «полная английская локализация — после
 * релиза»).
 *
 * Каждый `nameKey`/`descKey`/`titleKey`/`textKey` из остальных схем контента
 * обязан существовать в `ru.json` — эту кросс-ссылку проверяет
 * `tools/validate-data.ts`, не сама схема (одна схема не видит другие файлы).
 */

import { z } from 'zod';
import { I18nKeySchema } from './common';

export const LocaleSchema = z.enum(['ru', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

export const I18nDictionarySchema = z.record(I18nKeySchema, z.string().min(1));
export type I18nDictionary = z.infer<typeof I18nDictionarySchema>;
