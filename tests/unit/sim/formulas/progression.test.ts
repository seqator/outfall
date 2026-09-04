import { describe, expect, it } from 'vitest';
import {
  grantXp,
  INITIAL_PROGRESSION_STATE,
  levelForTotalXp,
  MAX_LEVEL,
  PERK_SLOT_LEVELS,
  perkSlotsUnlockedAtLevel,
  skillPointsPerLevel,
  xpForEnemyKill,
  xpForQuestCompletion,
  xpForSkillCheckSuccess,
  xpThresholdForLevel,
} from '../../../../src/sim/formulas/progression';

describe('sim/formulas/progression: xpThresholdForLevel (§4 rpg-system.md, вся таблица)', () => {
  const TABLE: ReadonlyArray<readonly [level: number, threshold: number]> = [
    [1, 0],
    [2, 300],
    [3, 600],
    [4, 1000],
    [5, 1500],
    [6, 2100],
    [7, 2800],
    [8, 3600],
    [9, 4500],
    [10, 5500],
    [11, 6600],
    [12, 7800],
    [13, 9100],
    [14, 10500],
  ];

  it.each(TABLE)('уровень %i → порог %i опыта', (level, threshold) => {
    expect(xpThresholdForLevel(level)).toBe(threshold);
  });
});

describe('sim/formulas/progression: levelForTotalXp', () => {
  it('ровно на пороге уже засчитывает следующий уровень', () => {
    expect(levelForTotalXp(299)).toBe(1);
    expect(levelForTotalXp(300)).toBe(2);
  });

  it('капается на MAX_LEVEL даже с огромным избытком опыта', () => {
    expect(levelForTotalXp(1_000_000)).toBe(MAX_LEVEL);
    expect(levelForTotalXp(xpThresholdForLevel(MAX_LEVEL))).toBe(MAX_LEVEL);
  });

  it('0 опыта → уровень 1', () => {
    expect(levelForTotalXp(0)).toBe(1);
  });
});

describe('sim/formulas/progression: skillPointsPerLevel (§2 rpg-system.md: «6 + Смекалка»)', () => {
  it('Смекалка 5 → 11 очков, Смекалка 8 → 14 очков', () => {
    expect(skillPointsPerLevel(5)).toBe(11);
    expect(skillPointsPerLevel(8)).toBe(14);
  });
});

describe('sim/formulas/progression: perkSlotsUnlockedAtLevel/PERK_SLOT_LEVELS (§3: слоты на 2/4/6/8/10/12/14)', () => {
  it('константа слотов совпадает с GDD', () => {
    expect(PERK_SLOT_LEVELS).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('уровень 1 — 0 слотов, уровень 5 — 2 слота (2 и 4), уровень 14 — все 7', () => {
    expect(perkSlotsUnlockedAtLevel(1)).toBe(0);
    expect(perkSlotsUnlockedAtLevel(5)).toBe(2);
    expect(perkSlotsUnlockedAtLevel(14)).toBe(7);
  });
});

describe('sim/formulas/progression: grantXp — набор XP → левелап', () => {
  it('опыта не хватает на уровень — состояние не меняется по уровню, xp накапливается', () => {
    const result = grantXp(INITIAL_PROGRESSION_STATE, 100, 5);
    expect(result.levelsGained).toBe(0);
    expect(result.state).toEqual({ xp: 100, level: 1, skillPoints: 0 });
  });

  it('ровно порог следующего уровня — левелап на 1, начисляются очки навыков по текущей Смекалке', () => {
    const result = grantXp(INITIAL_PROGRESSION_STATE, 300, 6);
    expect(result.levelsGained).toBe(1);
    expect(result.state).toEqual({ xp: 300, level: 2, skillPoints: 12 }); // 6+6=12
  });

  it('большой разовый прирост опыта левелапит сразу через несколько уровней, очки навыков суммируются по числу уровней', () => {
    const result = grantXp(INITIAL_PROGRESSION_STATE, 1000, 5); // ровно порог уровня 4
    expect(result.levelsGained).toBe(3); // 1 → 4
    expect(result.state.level).toBe(4);
    expect(result.state.skillPoints).toBe(3 * skillPointsPerLevel(5));
  });

  it('на капе (уровень 14) дальнейший опыт — no-op', () => {
    const capped = { xp: xpThresholdForLevel(14), level: 14, skillPoints: 20 };
    const result = grantXp(capped, 5000, 8);
    expect(result).toEqual({ state: capped, levelsGained: 0 });
  });

  it('накопительно: два вызова подряд дают тот же итог, что один суммарный', () => {
    const first = grantXp(INITIAL_PROGRESSION_STATE, 200, 6);
    const second = grantXp(first.state, 200, 6);
    const combined = grantXp(INITIAL_PROGRESSION_STATE, 400, 6);
    expect(second.state).toEqual(combined.state);
  });
});

describe('sim/formulas/progression: формулы опыта (§4)', () => {
  it('xpForEnemyKill: 10 × Уровень_врага × (1 + 0,25 × Опасность)', () => {
    expect(xpForEnemyKill(1, 0)).toBe(10);
    expect(xpForEnemyKill(5, 3)).toBeCloseTo(87.5, 6);
  });

  it('xpForQuestCompletion: 150 × Уровень_квеста', () => {
    expect(xpForQuestCompletion(1)).toBe(150);
    expect(xpForQuestCompletion(3)).toBe(450);
  });

  it('xpForSkillCheckSuccess: 30 × Уровень_квеста', () => {
    expect(xpForSkillCheckSuccess(1)).toBe(30);
    expect(xpForSkillCheckSuccess(3)).toBe(90);
  });
});
