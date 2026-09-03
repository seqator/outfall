/**
 * OF-009: `npm run validate` должен быть зелёным на валидных фикстурах и
 * падать с понятной ошибкой на фикстурах с битой ссылкой. Тестируем не CLI
 * (незачем плодить дочерние процессы), а экспортируемую чистую функцию
 * `validateDataDir` напрямую — она и есть тело CLI (`tools/validate-data.ts`).
 *
 * Фикстуры — `tests/fixtures/data/`:
 *   `valid/`                     — согласованный набор из 2 items, 1 perk,
 *                                   1 enemy, 1 quest, 1 map, 1 dialog, ru/en.
 *   `broken-map-enemy-ref/`      — map → enemy: несуществующий enemyId
 *   `broken-map-item-ref/`       — map → item: несуществующий itemId
 *   `broken-dialog-npc-ref/`     — dialog → npc: dialog.npc не существует
 *   `broken-dialog-quest-ref/`   — dialog → quest: эффект startQuest на несуществующий квест
 *   `broken-quest-item-ref/`     — quest → item: условие hasItem на несуществующий предмет
 *   `broken-perk-i18n-ref/`      — perk → i18n: nameKey отсутствует в ru.json
 *   `broken-i18n-missing-key/`   — dialog → i18n: textKey отсутствует в ru.json
 * Каждая фикстура — копия `valid/` с ровно одним намеренно битым полем, так
 * что валидатор обязан вернуть ровно одну релевантную ошибку.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDataDir } from '../../tools/validate-data';

const FIXTURES_DIR = join(__dirname, '../fixtures/data');

describe('validate-data: валидный набор', () => {
  it('проходит без ошибок и видит все сущности', () => {
    const result = validateDataDir(join(FIXTURES_DIR, 'valid'));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      items: 2,
      perks: 1,
      quests: 1,
      enemies: 1,
      maps: 1,
      dialogs: 1,
    });
  });
});

describe('validate-data: каталог данных отсутствует', () => {
  it('не считается ошибкой (контент ещё не создан — OF-024 и далее)', () => {
    const result = validateDataDir(join(FIXTURES_DIR, 'does-not-exist'));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe('validate-data: битые кросс-ссылки', () => {
  const cases: Array<{ dir: string; messageIncludes: string }> = [
    {
      dir: 'broken-map-enemy-ref',
      messageIncludes: 'enemy "enemy.ghost_crab" не найден в enemies.json',
    },
    {
      dir: 'broken-map-item-ref',
      messageIncludes: 'item "item.does_not_exist" не найден в items.json',
    },
    {
      dir: 'broken-dialog-npc-ref',
      messageIncludes: 'npc "npc.ghost" не найден ни на одной карте',
    },
    {
      dir: 'broken-dialog-quest-ref',
      messageIncludes: 'quest "quest.does_not_exist" не найден в quests.json',
    },
    {
      dir: 'broken-quest-item-ref',
      messageIncludes: 'item "item.does_not_exist" не найден в items.json',
    },
    {
      dir: 'broken-perk-i18n-ref',
      messageIncludes: 'i18n-ключ "perk.bystrye_ruki.name_typo" отсутствует в i18n/ru.json',
    },
    {
      dir: 'broken-i18n-missing-key',
      messageIncludes:
        'i18n-ключ "dialog.sanitar_intro.greet_missing" отсутствует в i18n/ru.json',
    },
  ];

  for (const { dir, messageIncludes } of cases) {
    it(`"${dir}" падает с понятной ошибкой`, () => {
      const result = validateDataDir(join(FIXTURES_DIR, dir));
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      const messages = result.issues.map((i) => i.message).join('\n');
      expect(messages).toContain(messageIncludes);
    });
  }
});
