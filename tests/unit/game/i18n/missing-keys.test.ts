/**
 * OF-019: «тест на отсутствующие ключи» — собирает все `*Key`-ссылки
 * (`textKey`/`nameKey`/`titleKey`/`descKey`/…) из `public/data/**`
 * (кроме самого `i18n/`) обходом произвольного JSON без привязки к
 * конкретной content-схеме — устойчиво к будущим файлам контента
 * (`items.json`/`quests.json`/… появятся в OF-032+, см. `docs/BACKLOG.md`).
 * Проверяет, что каждый такой ключ есть в `public/data/i18n/ru.json`
 * (обязательный словарь, `docs/tech/architecture.md` §8). `npm run validate`
 * (OF-009) делает то же самое по конкретным полям конкретных схем — этот
 * тест держит независимую, более широкую сетку как регрессионный страховщик.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseI18nDictionary } from '../../../../src/game/i18n';

const DATA_DIR = join(__dirname, '../../../../public/data');

/** Рекурсивно собирает все `.json`-файлы под `dir`, кроме поддиректории `i18n`. */
function listDataJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'i18n') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listDataJsonFiles(full));
    } else if (entry.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

/** Обходит произвольный JSON и собирает значения всех полей, чьё имя оканчивается на `Key` (`nameKey`/`descKey`/`textKey`/`titleKey`/…). */
function collectKeyRefs(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyRefs(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [field, fieldValue] of Object.entries(value)) {
      if (field.endsWith('Key') && typeof fieldValue === 'string') {
        out.add(fieldValue);
      }
      collectKeyRefs(fieldValue, out);
    }
  }
}

describe('i18n: ключи public/data/** должны существовать в ru.json', () => {
  it('ru.json — валидный словарь', () => {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'i18n', 'ru.json'), 'utf-8')) as unknown;
    expect(() => parseI18nDictionary(raw)).not.toThrow();
  });

  it('en.json (заглушка) — валидный словарь, если существует', () => {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'i18n', 'en.json'), 'utf-8')) as unknown;
    expect(() => parseI18nDictionary(raw)).not.toThrow();
  });

  it('каждый textKey/nameKey/titleKey/… из контента есть в ru.json', () => {
    const ruDict = parseI18nDictionary(
      JSON.parse(readFileSync(join(DATA_DIR, 'i18n', 'ru.json'), 'utf-8')) as unknown,
    );
    const ruKeys = new Set(Object.keys(ruDict));

    const refs = new Set<string>();
    for (const file of listDataJsonFiles(DATA_DIR)) {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
      collectKeyRefs(raw, refs);
    }

    expect(refs.size).toBeGreaterThan(0); // страховка от «тест ничего не собрал и потому всегда зелёный»

    const missing = [...refs].filter((key) => !ruKeys.has(key));
    expect(missing).toEqual([]);
  });
});
