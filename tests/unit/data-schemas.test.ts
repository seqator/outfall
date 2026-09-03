/**
 * OF-009: базовая проверка каждой zod-схемы контента в изоляции (без
 * кросс-ссылок — те покрыты `tests/unit/validate-data.test.ts`). Данные для
 * позитивных кейсов переиспользуются из `tests/fixtures/data/valid/` —
 * одного источника правды для обоих уровней тестов.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DialogSchema,
  EnemySchema,
  I18nDictionarySchema,
  ItemSchema,
  MapSchema,
  PerkSchema,
  QuestSchema,
  type Item,
} from '../../src/data/schemas';

const FIXTURES_DIR = join(__dirname, '../fixtures/data/valid');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('data schemas: валидные фикстуры проходят', () => {
  it('ItemSchema', () => {
    const items = readJson(join(FIXTURES_DIR, 'items.json'));
    expect(Array.isArray(items)).toBe(true);
    for (const item of items as unknown[]) {
      expect(ItemSchema.safeParse(item).success).toBe(true);
    }
  });

  it('PerkSchema', () => {
    const perks = readJson(join(FIXTURES_DIR, 'perks.json'));
    for (const perk of perks as unknown[]) {
      expect(PerkSchema.safeParse(perk).success).toBe(true);
    }
  });

  it('EnemySchema', () => {
    const enemies = readJson(join(FIXTURES_DIR, 'enemies.json'));
    for (const enemy of enemies as unknown[]) {
      expect(EnemySchema.safeParse(enemy).success).toBe(true);
    }
  });

  it('QuestSchema', () => {
    const quests = readJson(join(FIXTURES_DIR, 'quests.json'));
    for (const quest of quests as unknown[]) {
      expect(QuestSchema.safeParse(quest).success).toBe(true);
    }
  });

  it('MapSchema', () => {
    const map = readJson(join(FIXTURES_DIR, 'maps/truba.json'));
    expect(MapSchema.safeParse(map).success).toBe(true);
  });

  it('DialogSchema', () => {
    const dialog = readJson(join(FIXTURES_DIR, 'dialogs/sanitar_intro.json'));
    expect(DialogSchema.safeParse(dialog).success).toBe(true);
  });

  it('I18nDictionarySchema', () => {
    const ru = readJson(join(FIXTURES_DIR, 'i18n/ru.json'));
    expect(I18nDictionarySchema.safeParse(ru).success).toBe(true);
  });
});

describe('data schemas: типы выводятся из схем (z.infer)', () => {
  it('Item — доступ к полям без приведения типов, без валидного weapon.ammo не типизировано как обязательное', () => {
    const item: Item = {
      id: 'item.test_wrench',
      nameKey: 'item.test_wrench.name',
      descKey: 'item.test_wrench.desc',
      kind: 'weapon',
      weight: 2,
      value: 10,
      stack: 1,
      weapon: {
        branch: 'fists',
        damage: 18,
        rateMs: 600,
        spreadDeg: 0,
      },
      effects: [],
    };
    expect(item.weapon?.branch).toBe('fists');
  });
});

describe('data schemas: отклоняют некорректные данные', () => {
  it('ItemSchema — kind "weapon" без поля weapon отклоняется', () => {
    const bad = {
      id: 'item.broken_gun',
      nameKey: 'item.broken_gun.name',
      descKey: 'item.broken_gun.desc',
      kind: 'weapon',
      weight: 1,
      value: 10,
      effects: [],
    };
    expect(ItemSchema.safeParse(bad).success).toBe(false);
  });

  it('ItemSchema — id без пространства имён "item." отклоняется', () => {
    const bad = {
      id: 'wrong.id',
      nameKey: 'k',
      descKey: 'k',
      kind: 'junk',
      weight: 1,
      value: 1,
      effects: [],
    };
    expect(ItemSchema.safeParse(bad).success).toBe(false);
  });

  it('PerkSchema — minLevel вне {2,6,10} отклоняется', () => {
    const bad = {
      id: 'perk.broken',
      nameKey: 'k',
      descKey: 'k',
      archetype: 'strelok',
      minLevel: 3,
      requires: [{ type: 'stat', stat: 'ostrota', gte: 6 }],
    };
    expect(PerkSchema.safeParse(bad).success).toBe(false);
  });

  it('EnemySchema — телеграф вне диапазона 300–500 мс отклоняется (принцип §1 combat.md)', () => {
    const bad = {
      id: 'enemy.broken',
      nameKey: 'k',
      role: 'rusher',
      hp: 10,
      armor: 0,
      attack: { nameKey: 'k', telegraphMs: 100, damage: 1, cooldownMs: 100 },
      weakness: { nameKey: 'k', multiplier: 1.5 },
    };
    expect(EnemySchema.safeParse(bad).success).toBe(false);
  });

  it('MapSchema — длина слоя не совпадает с width×height отклоняется', () => {
    const bad = {
      id: 'map.broken',
      nameKey: 'k',
      width: 2,
      height: 2,
      tileset: 't',
      layers: { ground: [0, 0], walls: [0, 0, 0, 0], collision: [0, 0, 0, 0] },
    };
    expect(MapSchema.safeParse(bad).success).toBe(false);
  });

  it('DialogSchema — choices[].next ссылается на несуществующий узел того же диалога', () => {
    const bad = {
      id: 'dialog.broken',
      npc: 'npc.someone',
      start: 'greet',
      nodes: {
        greet: {
          speaker: 'npc.someone',
          textKey: 'k',
          choices: [{ textKey: 'k', next: 'node_that_does_not_exist' }],
        },
      },
    };
    expect(DialogSchema.safeParse(bad).success).toBe(false);
  });

  it('DialogSchema — start ссылается на несуществующий узел', () => {
    const bad = {
      id: 'dialog.broken2',
      npc: 'npc.someone',
      start: 'missing',
      nodes: { greet: { speaker: 'npc.someone', textKey: 'k', choices: [] } },
    };
    expect(DialogSchema.safeParse(bad).success).toBe(false);
  });

  it('QuestSchema — дублирующийся id стадии отклоняется', () => {
    const bad = {
      id: 'quest.broken',
      titleKey: 'k',
      stages: [
        { id: 'start', descKey: 'k', complete: { op: 'flag', key: 'x', eq: true } },
        { id: 'start', descKey: 'k', complete: { op: 'flag', key: 'y', eq: true } },
      ],
    };
    expect(QuestSchema.safeParse(bad).success).toBe(false);
  });
});
