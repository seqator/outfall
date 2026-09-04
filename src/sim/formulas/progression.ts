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
 *
 * OF-059 (`docs/design/progression-of-059.md`): `progression.level` теперь
 * реально влияет на бой — `maxHpForLevel` (§1) и `spendSkillPoints` (§2)
 * ниже. `skillPoints` в `ProgressionState` переопределён документом: это
 * больше не «неизрасходованный банк» (очки конвертируются в тот же тик, что
 * начислены, см. `grantKillXp` в `sim/systems/combat.ts`), а монотонный
 * счётчик «всего заработано за игру» для будущего HUD/дебага.
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

/** Позиция круговой раздачи `spendSkillPoints` (§2 `progression-of-059.md`) — индекс в `SKILL_BRANCH_ORDER`, переживает между уровнями. */
export type SkillPointCursor = 0 | 1 | 2;

export interface ProgressionState {
  readonly xp: number;
  readonly level: number;
  readonly skillPoints: number;
  readonly skillPointCursor: SkillPointCursor;
}

export const INITIAL_PROGRESSION_STATE: ProgressionState = {
  xp: 0,
  level: 1,
  skillPoints: 0,
  skillPointCursor: 0,
};

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
      skillPointCursor: current.skillPointCursor,
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

/**
 * Каркас героя для `maxHpForLevel` ниже (§1.1 `rpg-system.md`, «Каркас = 5»
 * — то же допущение «КОСТЯК-база 5», что и `PLAYER_KARKAS` в
 * `demo-scene.ts`). Продублирована здесь намеренно, а не импортирована:
 * `sim` не может зависеть от `game` (`docs/tech/architecture.md` §4,
 * «core ← sim ← game»). Когда появится экран создания персонажа и Каркас
 * станет переменным атрибутом героя, обе константы параметризуются вместе
 * тем же способом, каким `skillPointsPerLevel` уже принимает `smekalka`
 * аргументом.
 */
const HERO_KARKAS_OF_059 = 5;

/**
 * `maxHp` героя от уровня (§1 `progression-of-059.md`):
 * `БАЗА_ХП + 10 × (level − 1)`, где `БАЗА_ХП = 40 + 8 × Каркас` (§1.1
 * `rpg-system.md`). Линейная, без убывающей отдачи — тот же принцип, что
 * уже принят для `skillPointsPerLevel`. Вызывающая сторона (`grantKillXp`,
 * `sim/systems/combat.ts`) берёт дельту между уровнями и прибавляет её и к
 * `health.maxHp`, и к `health.hp` — левел-ап лечит, не только расширяет
 * потолок (см. докстринг документа §1).
 */
export function maxHpForLevel(level: number): number {
  return 40 + 8 * HERO_KARKAS_OF_059 + 10 * (level - 1);
}

/** Фиксированный порядок круговой раздачи очков навыков (§2 `progression-of-059.md`) — «Огрызок» → `guns`, «Дупло» → `heavy`, «Кран» → `fists`, единственные три ветки, которые реально читает боевой срез. */
export const SKILL_BRANCH_ORDER = ['guns', 'heavy', 'fists'] as const;
export type SkillBranch = (typeof SKILL_BRANCH_ORDER)[number];

/** Кап боевого навыка (`rpg-system.md` §2) — очки сверх капа сгорают, не переносятся на другую ветку. */
export const MAX_SKILL_VALUE = 100;

/** Форма `combatSkills`-компонента героя (`sim/components`), без импорта самого компонента — `formulas/*` не знает про ECS. */
export interface SkillBranchValues {
  readonly guns: number;
  readonly heavy: number;
  readonly fists: number;
}

export interface SkillPointSpendResult {
  readonly skills: SkillBranchValues;
  readonly cursor: SkillPointCursor;
}

/** `SKILL_BRANCH_ORDER[cursor % 3]` без `undefined` в типе (`noUncheckedIndexedAccess`) — индекс всегда в `[0, 3)`, третий элемент никогда не отсутствует, само исключение недостижимо. */
function branchForCursor(cursor: number): SkillBranch {
  const branch = SKILL_BRANCH_ORDER[cursor % 3];
  if (branch === undefined) {
    throw new Error(`spendSkillPoints: недостижимый курсор ${cursor}`);
  }
  return branch;
}

/**
 * Раздаёт `points` очков по одному, по кругу `guns → heavy → fists → guns →
 * …`, начиная с `cursor` и возвращая новую позицию курсора (не начинает
 * цикл заново на каждый вызов — продолжает с места предыдущего левел-апа,
 * §2 `progression-of-059.md`). Кап навыка — `MAX_SKILL_VALUE`, очки сверх
 * кэпа сгорают (курсор при этом всё равно продвигается — сгоревшее очко не
 * возвращается веткам, которые ещё не капнуты). Чистая функция — возвращает
 * новый объект `skills`, не мутирует аргумент (тот же стиль, что `grantXp`
 * выше).
 */
export function spendSkillPoints(
  points: number,
  cursor: SkillPointCursor,
  skills: SkillBranchValues,
): SkillPointSpendResult {
  const next: Record<SkillBranch, number> = { ...skills };
  let c: number = cursor;
  for (let i = 0; i < points; i++) {
    const branch = branchForCursor(c);
    if (next[branch] < MAX_SKILL_VALUE) next[branch] += 1;
    c += 1;
  }
  return { skills: next, cursor: (c % 3) as SkillPointCursor };
}
