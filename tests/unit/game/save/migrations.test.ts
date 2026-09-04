/**
 * OF-019: `src/game/save/migrations.ts`. Критерий задачи — «сейв старой
 * версии грузится»: фикстура `schemaVersion: 1` мигрирует в текущую версию.
 * v1 — исторический формат, задокументированный в заголовке `migrations.ts`
 * (в этой игре сохранений раньше не было — v1 введена вместе с этой задачей,
 * чтобы механизм миграции проверялся на настоящих данных, а не оставался
 * нетронутым интерфейсом «на будущее»).
 */

import { describe, expect, it } from 'vitest';
import {
  migrateToLatestSave,
  SaveDataError,
  type SaveStateV1,
} from '../../../../src/game/save/migrations';
import { CURRENT_SAVE_SCHEMA_VERSION } from '../../../../src/game/save/save-schema';

const fixtureV1: SaveStateV1 = {
  schemaVersion: 1,
  hero: { x: 12, y: 7, hp: 33, maxHp: 80 },
  inventory: {
    backpack: [{ uid: 'stack-1', itemId: 'item.cons_bint', quantity: 2 }],
    equipment: {},
    wallet: 40,
  },
  flags: { 'flag.met_sanitar': true },
  quests: { 'quest.svoi_truby': 'middle' },
  rngSeed: 20260101,
  worldTick: 1500,
};

describe('migrations: migrateToLatestSave', () => {
  it('мигрирует сейв версии 1 в текущую версию', () => {
    const migrated = migrateToLatestSave(fixtureV1);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.hero).toMatchObject({ x: 12, y: 7, hp: 33, maxHp: 80, armor: 0 });
    expect(migrated.hero.dashState).toEqual({ iframesRemainingMs: 0, cooldownRemainingMs: 0 });
    expect(migrated.weapons.equipped).toBe('item.pistol_ogryzok');
    expect(migrated.weapons.states['item.pistol_ogryzok'].ammo).toBeGreaterThan(0);
    expect(migrated.inventory).toEqual(fixtureV1.inventory);
    expect(migrated.flags).toEqual(fixtureV1.flags);
    // v1 хранил только текущую стадию — v2 достраивает историю из одного элемента.
    expect(migrated.quests).toEqual({
      'quest.svoi_truby': { stage: 'middle', history: ['middle'] },
    });
    expect(migrated.rngSeed).toBe(fixtureV1.rngSeed);
    expect(migrated.worldTick).toBe(fixtureV1.worldTick);
  });

  it('данные уже текущей версии проходят без изменений (кроме нормализации схемой)', () => {
    const current = migrateToLatestSave(fixtureV1);
    const again = migrateToLatestSave(current);
    expect(again).toEqual(current);
  });

  it('бросает SaveDataError, если schemaVersion отсутствует/не число', () => {
    expect(() => migrateToLatestSave({ hero: {} })).toThrow(SaveDataError);
    expect(() => migrateToLatestSave('не объект')).toThrow(SaveDataError);
    expect(() => migrateToLatestSave(null)).toThrow(SaveDataError);
  });

  it('бросает SaveDataError на версии новее поддерживаемой', () => {
    expect(() => migrateToLatestSave({ schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1 })).toThrow(
      SaveDataError,
    );
  });

  it('бросает SaveDataError на непозитивной версии (envelope: schemaVersion positive int)', () => {
    expect(() => migrateToLatestSave({ schemaVersion: 0 })).toThrow(SaveDataError);
  });

  it('бросает SaveDataError, если данные версии 1 не проходят её собственную схему', () => {
    const broken = { ...fixtureV1, hero: { x: 1 } };
    expect(() => migrateToLatestSave(broken)).toThrow(SaveDataError);
  });
});
