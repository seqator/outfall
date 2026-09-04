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

/** v2 (до OF-059) — герой без `progression` (`docs/design/progression-of-059.md`, `save-schema.ts: ProgressionSaveSchema`). */
const fixtureV2 = {
  schemaVersion: 2,
  savedAtMs: 1700000000000,
  hero: {
    x: 9,
    y: 4,
    hp: 60,
    maxHp: 80,
    armor: 0,
    facing: { dirX: 1, dirY: 0 },
    attributes: { courage: 5, reflex: 5 },
    combatSkills: { guns: 50, heavy: 50, fists: 50 },
    dashState: { iframesRemainingMs: 0, cooldownRemainingMs: 0 },
  },
  weapons: {
    equipped: 'item.pistol_ogryzok',
    states: {
      'item.pistol_ogryzok': {
        ammo: 8,
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
  inventory: { backpack: [], equipment: {}, wallet: 0 },
  flags: {},
  quests: {},
  rngSeed: 5,
  worldTick: 300,
};

describe('migrations: migrateToLatestSave', () => {
  it('мигрирует сейв версии 2 (без progression, до OF-059) в текущую версию — герой уровня 1', () => {
    const migrated = migrateToLatestSave(fixtureV2);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.hero.x).toBe(9);
    expect(migrated.hero.hp).toBe(60);
    expect(migrated.hero.progression).toEqual({
      xp: 0,
      level: 1,
      skillPoints: 0,
      skillPointCursor: 0,
      smekalka: 5,
    });
  });

  it('мигрирует сейв версии 1 в текущую версию', () => {
    const migrated = migrateToLatestSave(fixtureV1);

    expect(migrated.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated.hero).toMatchObject({ x: 12, y: 7, hp: 33, maxHp: 80, armor: 0 });
    expect(migrated.hero.dashState).toEqual({ iframesRemainingMs: 0, cooldownRemainingMs: 0 });
    // v1 → v2 → v3: `progression` не существовала ни в одной из старых версий
    // (OF-059 добавила её только в v3) — миграция достраивает героя уровня 1.
    expect(migrated.hero.progression).toEqual({
      xp: 0,
      level: 1,
      skillPoints: 0,
      skillPointCursor: 0,
      smekalka: 5,
    });
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
