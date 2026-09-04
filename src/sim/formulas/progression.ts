/**
 * Прогрессия персонажа (`docs/design/rpg-system.md` §4, OF-035): опыт,
 * уровни (кап 14), очки навыков за уровень, слоты перков (`perks.ts`).
 * Чистые функции, без RNG и без знания о ECS — тот же стиль, что и
 * `formulas/damage.ts`/`shock.ts`.
 *
 * ДОПУЩЕНИЕ (Порог(1)): формула §4 `Порог(L) = 100 × L × (L + 1) / 2` при
 * L=1 даёт 100, но таблица §4 явно фиксирует «Порог(1) = 0» (уровень 1 —
 * стартовый, опыт для него не нужен). Таблица — источник истины для
 * конкретных чисел (та же логика, что уже применена в `shock.ts`), поэтому
 * `xpThresholdForLevel(1)` возвращает 0 отдельным случаем, а формула
 * применяется буквально для L ≥ 2, где она совпадает с таблицей (проверено
 * `progression.test.ts` по всем 14 строкам).
 *
 * ДОПУЩЕНИЕ (опыт за врага сверх капа): §4 фиксирует «Кап — уровень 14», но
 * не говорит, что происходит с опытом, полученным после его достижения.
 * Простейшая согласованная трактовка: `grantXp` на уровне 14 — no-op (не
 * копит лишний опыт, не даёт очков навыков) — «кап» в буквальном смысле.
 */

export const MAX_LEVEL = 14;

/** Уровни, на которых открывается слот перка — «каждые 2 уровня», `rpg-system.md` §3. */
export const PERK_SLOT_LEVELS: readonly number[] = [2, 4, 6, 8, 10, 12, 14];

const XP_LEVEL_COEF = 100;

/** `Порог(L) = 100 × L × (L + 1) / 2` для L ≥ 2, `Порог(1) = 0` (см. ДОПУЩЕНИЕ выше). */
export function xpThresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  return (XP_LEVEL_COEF * level * (level + 1)) / 2;
}

/** Наибольший уровень (капнутый на `MAX_LEVEL`), для которого суммарный опыт `xp` уже достаточен. */
export function levelForTotalXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpThresholdForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

/** Очков навыков за уровень: `6 + Смекалка` (`rpg-system.md` §2), берётся значение Смекалки на момент повышения уровня. */
export function skillPointsPerLevel(smekalka: number): number {
  return 6 + smekalka;
}

/** Сколько слотов перков уже открыто на данном уровне (0..7). */
export function perkSlotsUnlockedAtLevel(level: number): number {
  let count = 0;
  for (const slotLevel of PERK_SLOT_LEVELS) {
    if (slotLevel <= level) count += 1;
  }
  return count;
}

export interface ProgressionState {
  readonly xp: number;
  readonly level: number;
  readonly skillPoints: number;
}

export const INITIAL_PROGRESSION_STATE: ProgressionState = { xp: 0, level: 1, skillPoints: 0 };

export interface XpGrantResult {
  readonly state: ProgressionState;
  /** Сколько уровней получено этим начислением (0, если опыта не хватило на следующий уровень). */
  readonly levelsGained: number;
}

/**
 * Начисляет `amount` опыта и пересчитывает уровень/очки навыков. На капе
 * (`current.level >= MAX_LEVEL`) — no-op, см. ДОПУЩЕНИЕ в шапке файла.
 */
export function grantXp(current: ProgressionState, amount: number, smekalka: number): XpGrantResult {
  if (current.level >= MAX_LEVEL) return { state: current, levelsGained: 0 };

  const nextXp = current.xp + amount;
  const nextLevel = levelForTotalXp(nextXp);
  const levelsGained = nextLevel - current.level;
  const gainedSkillPoints = levelsGained * skillPointsPerLevel(smekalka);

  return {
    state: {
      xp: nextXp,
      level: nextLevel,
      skillPoints: current.skillPoints + gainedSkillPoints,
    },
    levelsGained,
  };
}

/** Опыт за врага: `10 × Уровень_врага × (1 + 0,25 × Опасность)` (§4 `rpg-system.md`). */
export function xpForEnemyKill(enemyLevel: number, danger: number): number {
  return 10 * enemyLevel * (1 + 0.25 * danger);
}

/**
 * Опыт за квест: `150 × Уровень_квеста` (§4). Формула зафиксирована и
 * протестирована здесь; квестовая система (`src/game/quest`, OF-032/036) на
 * сегодня не хранит «Уровень_квеста» как рантайм-число — интеграция вызова
 * остаётся задачам, которые пишут квесты (OF-036/040), не в скоупе OF-035.
 */
export function xpForQuestCompletion(questLevel: number): number {
  return 150 * questLevel;
}

/** Опыт за успешную проверку навыка в диалоге: `30 × Уровень_квеста` (§4) — тот же статус, что и `xpForQuestCompletion` выше. */
export function xpForSkillCheckSuccess(questLevel: number): number {
  return 30 * questLevel;
}
