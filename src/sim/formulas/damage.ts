/**
 * Урон (`docs/design/combat.md` §4.1 и §5.1) — чистые функции, без RNG и без
 * знания о ECS. `computeDamage` покрывает и «стволы/тяжёлое/ножи» (общая
 * формула §4.1, используется и для входящего урона по игроку), и любую
 * атаку, помеченную «игнорирует броню» (`ignoresArmor`). `computeFistsDamage`
 * — отдельная ветка Кулаков (§5.1): другие коэффициенты навыка и только
 * половина брони вычитается.
 */

/** Общие параметры формулы урона — одни и те же имена, что в GDD (§4.1). */
export interface DamageParams {
  /** База — из таблицы оружия/атаки врага. */
  readonly base: number;
  /** Соответствующий боевой навык атакующего, 0–100. */
  readonly skill: number;
  /** ∈ {1; 2} — см. §4.2 `computeCritChance`/`rollCrit` (`crit.ts`). */
  readonly crit: 1 | 2;
  /** Множитель слабости цели из §2 combat.md; 1, если условие не выполнено. */
  readonly weakness: number;
  /** Броня цели. */
  readonly armor: number;
  /** true — член `−Броня` не применяется (слабость, которая «игнорирует броню»). */
  readonly ignoresArmor?: boolean;
}

const SKILL_COEF_A = 0.7;
const SKILL_COEF_B = 0.006;

/**
 * `Урон = max(1, База × (0,7 + 0,006 × Навык) × Крит × Слабость − Броня)`.
 * Используется и «игрок бьёт врага» (Стволы/Тяжёлое/Ножи), и «враг бьёт
 * игрока» (§4.1: «формула входящего урона по игроку и по врагу одна и та
 * же»).
 */
export function computeDamage(params: DamageParams): number {
  const { base, skill, crit, weakness, armor, ignoresArmor = false } = params;
  const effectiveArmor = ignoresArmor ? 0 : armor;
  const raw = base * (SKILL_COEF_A + SKILL_COEF_B * skill) * crit * weakness - effectiveArmor;
  return Math.max(1, raw);
}

const FISTS_SKILL_COEF_A = 0.75;
const FISTS_SKILL_COEF_B = 0.005;
const FISTS_ARMOR_FACTOR = 0.5;

/**
 * Кулаки (§5.1): `Урон = max(1, База × (0,75 + 0,005 × Навык) × Крит × Слабость − Броня × 0,5)`.
 * Дробящий удар проламывает только половину брони — сильнее против
 * бронированных целей, чем формула §4.1.
 */
export function computeFistsDamage(params: DamageParams): number {
  const { base, skill, crit, weakness, armor, ignoresArmor = false } = params;
  const effectiveArmor = ignoresArmor ? 0 : armor * FISTS_ARMOR_FACTOR;
  const raw = base * (FISTS_SKILL_COEF_A + FISTS_SKILL_COEF_B * skill) * crit * weakness - effectiveArmor;
  return Math.max(1, raw);
}
