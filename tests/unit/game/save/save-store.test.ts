/**
 * OF-019: `src/game/save/save-store.ts`. Раунд-трип через localStorage-порт,
 * лимит слота ≤ 200 KB, экспорт/импорт файлом, загрузка сейва старой версии
 * через `SaveStore.load()` (не только напрямую через `migrations.ts`).
 */

import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../../../src/game/save/memory-storage';
import { SaveDataError } from '../../../../src/game/save/migrations';
import type { SaveStateV1 } from '../../../../src/game/save/migrations';
import { CURRENT_SAVE_SCHEMA_VERSION, type SaveState } from '../../../../src/game/save/save-schema';
import {
  createSaveStore,
  SAVE_SLOT_MAX_BYTES,
  SaveSlotTooLargeError,
} from '../../../../src/game/save/save-store';

function buildSave(overrides: Partial<SaveState> = {}): SaveState {
  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtMs: 1700000000000,
    hero: {
      x: 10.5,
      y: 6.25,
      hp: 62,
      maxHp: 80,
      armor: 0,
      facing: { dirX: 0, dirY: 1 },
      attributes: { courage: 5, reflex: 5 },
      combatSkills: { guns: 50, heavy: 50, fists: 50 },
      dashState: { iframesRemainingMs: 0, cooldownRemainingMs: 120 },
      progression: { xp: 0, level: 1, skillPoints: 0, skillPointCursor: 0, smekalka: 5 },
    },
    weapons: {
      equipped: 'item.pistol_ogryzok',
      states: {
        'item.pistol_ogryzok': {
          ammo: 5,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          comboHits: 0,
          comboTargetId: null,
        },
        'item.shotgun_duplo': {
          ammo: 2,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          comboHits: 0,
          comboTargetId: null,
        },
        'item.wrench_kran': {
          ammo: 0,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          comboHits: 0,
          comboTargetId: null,
        },
      },
    },
    inventory: {
      backpack: [{ uid: 'stack-1', itemId: 'item.cons_bint', quantity: 3 }],
      equipment: {},
      wallet: 55,
    },
    flags: { 'flag.met_sanitar': true },
    quests: { 'quest.svoi_truby': { stage: 'middle', history: ['start', 'middle'] } },
    rngSeed: 20260101,
    worldTick: 900,
    ...overrides,
  };
}

describe('save-store: save/load через localStorage-порт', () => {
  it('раунд-трип: save() → load() возвращает эквивалентный сейв', () => {
    const store = createSaveStore(createMemoryStorage());
    const save = buildSave();
    store.save(save);
    expect(store.load()).toEqual(save);
  });

  it('load() без предыдущего save() — null', () => {
    const store = createSaveStore(createMemoryStorage());
    expect(store.load()).toBeNull();
  });

  it('save() пишет под ключом, включающим версию схемы', () => {
    const storage = createMemoryStorage();
    createSaveStore(storage).save(buildSave());
    expect(storage.getItem(`outfall:save:v${CURRENT_SAVE_SCHEMA_VERSION}`)).not.toBeNull();
  });

  it('load() находит и мигрирует сейв старой версии, записанный под её собственным ключом', () => {
    const storage = createMemoryStorage();
    const v1: SaveStateV1 = {
      schemaVersion: 1,
      hero: { x: 1, y: 2, hp: 40, maxHp: 80 },
      inventory: { backpack: [], equipment: {}, wallet: 0 },
      flags: {},
      quests: {},
      rngSeed: 1,
      worldTick: 0,
    };
    storage.setItem('outfall:save:v1', JSON.stringify(v1));

    const store = createSaveStore(storage);
    const loaded = store.load();
    expect(loaded?.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(loaded?.hero.x).toBe(1);
  });

  it('save() бросает SaveSlotTooLargeError, если слот больше 200 KB', () => {
    const store = createSaveStore(createMemoryStorage());
    const huge = buildSave({ flags: { 'flag.huge': 'x'.repeat(SAVE_SLOT_MAX_BYTES) } });
    expect(() => store.save(huge)).toThrow(SaveSlotTooLargeError);
  });

  it('реалистичный сейв (полный вещмешок) укладывается в лимит слота с большим запасом', () => {
    const backpack = Array.from({ length: 200 }, (_, i) => ({
      uid: `stack-${i}`,
      itemId: 'item.mat_detali',
      quantity: 10,
    }));
    const save = buildSave({ inventory: { backpack, equipment: {}, wallet: 999 } });
    const text = JSON.stringify(save);
    expect(new TextEncoder().encode(text).length).toBeLessThan(SAVE_SLOT_MAX_BYTES);
    const store = createSaveStore(createMemoryStorage());
    expect(() => store.save(save)).not.toThrow();
  });
});

describe('save-store: exportToFile / importFromFile', () => {
  it('раунд-трип: exportToFile() → importFromFile() возвращает эквивалентный сейв', () => {
    const store = createSaveStore(createMemoryStorage());
    const save = buildSave();
    const text = store.exportToFile(save);
    expect(typeof text).toBe('string');
    expect(store.importFromFile(text)).toEqual(save);
  });

  it('importFromFile мигрирует экспортированный файл сейва старой версии', () => {
    const store = createSaveStore(createMemoryStorage());
    const v1: SaveStateV1 = {
      schemaVersion: 1,
      hero: { x: 3, y: 3, hp: 80, maxHp: 80 },
      inventory: { backpack: [], equipment: {}, wallet: 0 },
      flags: {},
      quests: {},
      rngSeed: 7,
      worldTick: 0,
    };
    const imported = store.importFromFile(JSON.stringify(v1));
    expect(imported.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  });

  it('importFromFile бросает SaveDataError на битом JSON', () => {
    const store = createSaveStore(createMemoryStorage());
    expect(() => store.importFromFile('{ не json')).toThrow(SaveDataError);
  });

  it('importFromFile бросает SaveDataError на валидном JSON без schemaVersion', () => {
    const store = createSaveStore(createMemoryStorage());
    expect(() => store.importFromFile(JSON.stringify({ foo: 'bar' }))).toThrow(SaveDataError);
  });
});
