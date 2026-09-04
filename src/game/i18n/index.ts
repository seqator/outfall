/**
 * Словарь-резолвер локализации (OF-019, `docs/tech/architecture.md` §8,
 * `src/data/schemas/i18n.ts` OF-009). Плоский `ключ → строка`
 * (`I18nDictionarySchema`); `ru.json` обязателен, `en.json` — заглушка
 * (`docs/BACKLOG.md`, скоуп-стоп №8).
 *
 * `t(key)` никогда не бросает исключение на отсутствующем ключе — «не
 * должно ронять игру» из задачи: возвращает сам ключ (виден в UI как
 * плейсхолдер, как уже делает `dialogue-screen.ts` для `[Язык]`-проверок) и
 * пишет `console.warn`, чтобы пропажа перевода была видна в консоли/CI, а не
 * тонула молча.
 */

import { I18nDictionarySchema, type I18nDictionary, type Locale } from '../../data/schemas';

export interface I18n {
  readonly locale: Locale;
  t(key: string): string;
}

/** Валидирует сырой JSON словаря через `I18nDictionarySchema` — бросает с понятным сообщением на кривом файле контента (используется на загрузке, не в `t()`). */
export function parseI18nDictionary(raw: unknown): I18nDictionary {
  const result = I18nDictionarySchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`i18n: словарь не прошёл схему: ${result.error.message}`);
  }
  return result.data;
}

/** Резолвер над уже загруженным и провалидированным словарём — чистая функция, без DOM/fetch. */
export function createI18n(locale: Locale, dictionary: I18nDictionary): I18n {
  return {
    locale,
    t(key: string): string {
      const value = dictionary[key];
      if (value === undefined) {
        console.warn(`i18n: нет перевода для ключа "${key}" (locale="${locale}")`);
        return key;
      }
      return value;
    },
  };
}

/**
 * Минимальный контракт `fetch`, которого достаточно для загрузки JSON —
 * реальный `window.fetch` ему структурно соответствует (можно передавать
 * его как есть), а тесты подставляют лёгкую заглушку без настоящего DOM.
 */
export interface I18nFetch {
  (
    url: string,
  ): Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;
}

/**
 * Грузит и валидирует `<baseUrl>/<locale>.json` (по умолчанию
 * `public/data/i18n/<locale>.json`, отдаётся статикой по пути
 * `/data/i18n/<locale>.json`). Единственная функция модуля, которая трогает
 * сеть — `game`-слою это разрешено (граница `no-restricted-globals`
 * действует только на `core`/`sim`, см. `eslint.config.js`), `core`/`sim`
 * саму локализацию не видят.
 */
export async function loadI18nDictionary(
  locale: Locale,
  baseUrl = '/data/i18n',
  fetchImpl: I18nFetch = fetch,
): Promise<I18nDictionary> {
  const response = await fetchImpl(`${baseUrl}/${locale}.json`);
  if (!response.ok) {
    throw new Error(`i18n: не удалось загрузить словарь "${locale}" (HTTP ${response.status})`);
  }
  const raw = await response.json();
  return parseI18nDictionary(raw);
}
