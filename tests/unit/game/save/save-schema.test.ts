/**
 * OF-019: `src/game/save/save-schema.ts` — форма сейва и её граничные случаи.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveStateSchema,
  type SaveState,
} from '../../../../src/game/save/save-schema';

function buildValidSave(): SaveState {
  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtMs: 1000,
    hero: {
      x: 3,
      y: 4,
      hp: 55,
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
    rngSeed: 42,
    worldTick: 0,
  };
}

describe('save-schema: SaveStateSchema', () => {
  it('принимает валидный сейв как есть', () => {
    const save = buildValidSave();
    expect(SaveStateSchema.parse(save)).toEqual(save);
  });

  it('отвергает чужую версию схемы', () => {
    const save = { ...buildValidSave(), schemaVersion: 999 };
    expect(SaveStateSchema.safeParse(save).success).toBe(false);
  });

  it('отвергает отрицательный HP', () => {
    const save = buildValidSave();
    const broken = { ...save, hero: { ...save.hero, hp: -1 } };
    expect(SaveStateSchema.safeParse(broken).success).toBe(false);
  });

  it('отвергает неизвестный id оружия в states', () => {
    const save = buildValidSave();
    const broken = {
      ...save,
      weapons: { ...save.weapons, equipped: 'item.laser_duga' },
    };
    expect(SaveStateSchema.safeParse(broken).success).toBe(false);
  });

  it('принимает произвольные флаги (bool/number/string)', () => {
    const save = buildValidSave();
    const withFlags = {
      ...save,
      flags: { 'flag.a': true, 'flag.b': 3, 'flag.c': 'spasti' },
    };
    expect(SaveStateSchema.safeParse(withFlags).success).toBe(true);
  });

  it('принимает стадии квестов с историей', () => {
    const save = buildValidSave();
    const withQuests = {
      ...save,
      quests: { 'quest.svoi_truby': { stage: 'middle', history: ['start', 'middle'] } },
    };
    expect(SaveStateSchema.safeParse(withQuests).success).toBe(true);
  });
});
