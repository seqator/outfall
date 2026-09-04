import { describe, expect, it } from 'vitest';
import {
  grantXp,
  INITIAL_PROGRESSION_STATE,
  levelForTotalXp,
  MAX_LEVEL,
  MAX_SKILL_VALUE,
  maxHpForLevel,
  PERK_SLOT_LEVELS,
  perkSlotsUnlockedAtLevel,
  skillPointsPerLevel,
  spendSkillPoints,
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
    expect(result.state).toEqual({ xp: 100, level: 1, skillPoints: 0, skillPointCursor: 0 });
  });

  it('ровно порог следующего уровня — левелап на 1, начисляются очки навыков по текущей Смекалке', () => {
    const result = grantXp(INITIAL_PROGRESSION_STATE, 300, 6);
    expect(result.levelsGained).toBe(1);
    expect(result.state).toEqual({ xp: 300, level: 2, skillPoints: 12, skillPointCursor: 0 }); // 6+6=12; grantXp не трогает cursor — это отдельный шаг (`spendSkillPoints`)
  });

  it('большой разовый прирост опыта левелапит сразу через несколько уровней, очки навыков суммируются по числу уровней', () => {
    const result = grantXp(INITIAL_PROGRESSION_STATE, 1000, 5); // ровно порог уровня 4
    expect(result.levelsGained).toBe(3); // 1 → 4
    expect(result.state.level).toBe(4);
    expect(result.state.skillPoints).toBe(3 * skillPointsPerLevel(5));
  });

  it('на капе (уровень 14) дальнейший опыт — no-op', () => {
    const capped = { xp: xpThresholdForLevel(14), level: 14, skillPoints: 20, skillPointCursor: 1 as const };
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

describe('sim/formulas/progression: maxHpForLevel (OF-059 §1, progression-of-059.md)', () => {
  it('уровень 1 → 80, уровень 14 (кап) → 210 — эталонные значения таблицы §1', () => {
    expect(maxHpForLevel(1)).toBe(80);
    expect(maxHpForLevel(14)).toBe(210);
  });

  it('вся вехи-таблица §1: 2→90, 4→110, 6→130, 8→150, 10→170, 12→190', () => {
    expect(maxHpForLevel(2)).toBe(90);
    expect(maxHpForLevel(4)).toBe(110);
    expect(maxHpForLevel(6)).toBe(130);
    expect(maxHpForLevel(8)).toBe(150);
    expect(maxHpForLevel(10)).toBe(170);
    expect(maxHpForLevel(12)).toBe(190);
  });

  it('монотонно растёт (+10) по всем 14 уровням', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(maxHpForLevel(level)).toBe(maxHpForLevel(level - 1) + 10);
    }
  });
});

describe('sim/formulas/progression: spendSkillPoints (OF-059 §2, progression-of-059.md)', () => {
  const START = { guns: 50, heavy: 50, fists: 50 };

  it('раздаёт по кругу guns → heavy → fists → …, продолжая с переданного cursor', () => {
    // 11 очков от cursor=0 (Смекалка=5 ⇒ skillPointsPerLevel(5)=11, таблица §2, уровень 2): guns/heavy по 4, fists 3.
    const result = spendSkillPoints(11, 0, START);
    expect(result).toEqual({ skills: { guns: 54, heavy: 54, fists: 53 }, cursor: 2 });
  });

  it('детерминированная последовательность через все контрольные уровни таблицы §2 (Смекалка=5, 11 очков/уровень)', () => {
    const TABLE: ReadonlyArray<
      readonly [guns: number, heavy: number, fists: number]
    > = [
      [54, 54, 53], // уровень 2
      [61, 61, 61], // уровень 4 (ещё +22 очка = 2 левел-апа)
      [69, 68, 68], // уровень 6
      [76, 76, 75], // уровень 8
      [83, 83, 83], // уровень 10
      [91, 90, 90], // уровень 12
      [98, 98, 97], // уровень 14 (кап)
    ];
    let skills = START;
    let cursor: 0 | 1 | 2 = 0;
    // Уровни 2,4,6,8,10,12,14 — по два левел-апа (22 очка) между контрольными строками, кроме первой (11 очков, уровень 1→2).
    const pointsBetweenRows = [11, 22, 22, 22, 22, 22, 22];
    for (let i = 0; i < TABLE.length; i++) {
      const spend = spendSkillPoints(pointsBetweenRows[i] ?? 0, cursor, skills);
      skills = spend.skills;
      cursor = spend.cursor;
      const [guns, heavy, fists] = TABLE[i] ?? [0, 0, 0];
      expect(skills).toEqual({ guns, heavy, fists });
    }
  });

  it('кап 100: сверх кэпа очки сгорают, не переносятся на другую ветку (искусственно guns=99, 5 очков подряд на guns)', () => {
    // `cursor: 0` в каждом отдельном вызове держит все 5 очков на одной ветке
    // (`guns`, первая в `SKILL_BRANCH_ORDER`) — изолированная проверка капа,
    // независимая от круговой развёртки (уже покрыта тестами выше).
    let guns = 99;
    for (let i = 0; i < 5; i++) {
      guns = spendSkillPoints(1, 0, { guns, heavy: 50, fists: 50 }).skills.guns;
    }
    expect(guns).toBe(MAX_SKILL_VALUE);
    expect(guns).not.toBe(104);
  });

  it('кап 100 и в круговой раздаче: очки, которые попадают на уже капнутую ветку, сгорают, не «утекая» другим', () => {
    const capped = { guns: 100, heavy: 50, fists: 50 };
    const result = spendSkillPoints(6, 0, capped); // guns получил бы 2 очка (idx0,3) — оба сгорают
    expect(result.skills).toEqual({ guns: 100, heavy: 52, fists: 52 });
  });

  it('не мутирует переданный объект skills (чистая функция)', () => {
    const before = { guns: 50, heavy: 50, fists: 50 };
    const snapshot = { ...before };
    spendSkillPoints(11, 0, before);
    expect(before).toEqual(snapshot);
  });

  it('0 очков — no-op, cursor не меняется', () => {
    expect(spendSkillPoints(0, 1, START)).toEqual({ skills: START, cursor: 1 });
  });
});
