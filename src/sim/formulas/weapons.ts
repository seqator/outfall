/**
 * Статические данные оружия среза (`docs/design/combat.md` §3: «Огрызок»,
 * «Дупло», «Кран» — три оружия, помеченные «да» в столбце «Срез»). Это не
 * формула, а прямое отражение таблицы §3 в виде данных, используемых
 * `aiSystem`/`combatSystem` (`src/sim/systems/*`) — лежит рядом с
 * `formulas/` по указанию задачи (`src/sim/formulas/**`), а не в
 * `data/schemas` (там — zod-схема контента для JSON, не хардкод дефолтов
 * вертикального среза).
 *
 * `item.pistol_ogryzok`/`item.shotgun_duplo`/`item.wrench_kran` — id из
 * комментария `src/data/schemas/item.ts` (уже согласованы в схеме предметов
 * как ожидаемые id этих трёх оружий).
 *
 * Автомат «Затвор», лучевой резак «Дуга», нож «Стропорез» (§3, «позже») —
 * вне скоупа OF-016 (см. отчёт задачи, дальнейшее — OF-035).
 */

export type WeaponId = 'item.pistol_ogryzok' | 'item.shotgun_duplo' | 'item.wrench_kran';
export type WeaponBranch = 'guns' | 'heavy' | 'fists';

export interface RangeFalloff {
  /** Дистанция в метрах (=тайлах, см. допущение в `enemies.ts`), после которой действует множитель. */
  readonly beyondM: number;
  readonly multiplier: number;
}

export interface WeaponDef {
  readonly id: WeaponId;
  readonly nameKey: string;
  readonly branch: WeaponBranch;
  /** База урона (§4.1/§5.1). */
  readonly baseDamage: number;
  /** Мс между выстрелами/ударами (`1000 / скорострельность`, §3). */
  readonly fireCooldownMs: number;
  /** Патронов в магазине; `undefined` — оружие без патронов (Кулаки). */
  readonly magazineSize?: number;
  readonly reloadMs?: number;
  /** Базовый конус разброса, градусы (§4.3); 0 — ближний бой (разброса нет). */
  readonly baseSpreadDeg: number;
  /** КоэфДвижения на бегу (§4.3/§3.1): 1,6 стандартно, 1,3 для «Огрызка». Не используется оружием ближнего боя. */
  readonly moveSpreadCoef: number;
  /** Радиус удара «Крана», метры (=тайлы) — только для ближнего боя. */
  readonly meleeRangeM?: number;
  /** «Дупло»: урон ×0,5 на дистанции свыше `beyondM` (§3.1). */
  readonly rangeFalloff?: RangeFalloff;
}

export const WEAPON_DEFS: Readonly<Record<WeaponId, WeaponDef>> = {
  'item.pistol_ogryzok': {
    id: 'item.pistol_ogryzok',
    nameKey: 'item.pistol_ogryzok.name',
    branch: 'guns',
    baseDamage: 8,
    fireCooldownMs: 250, // 4 выстр/с
    magazineSize: 8,
    reloadMs: 1200,
    baseSpreadDeg: 6,
    moveSpreadCoef: 1.3, // «лёгкий» — коэффициент разброса от движения ×1,3 вместо стандартного ×1,6 (§3.1)
  },
  'item.shotgun_duplo': {
    id: 'item.shotgun_duplo',
    nameKey: 'item.shotgun_duplo.name',
    branch: 'heavy',
    baseDamage: 14,
    fireCooldownMs: 1400, // 1 выстр/1,4 с
    magazineSize: 2,
    reloadMs: 1800,
    baseSpreadDeg: 18,
    moveSpreadCoef: 1.6,
    rangeFalloff: { beyondM: 6, multiplier: 0.5 }, // урон падает с дистанцией — свыше 6 м урон ×0,5 (§3.1)
  },
  'item.wrench_kran': {
    id: 'item.wrench_kran',
    nameKey: 'item.wrench_kran.name',
    branch: 'fists',
    baseDamage: 18,
    fireCooldownMs: 600, // 1 удар/0,6 с
    baseSpreadDeg: 0,
    moveSpreadCoef: 1,
    meleeRangeM: 1.2,
  },
};

/** Порядок клавиш slot1/slot2/slot3 (`core/input.ts`) → оружие. Согласовано геймплей-программистом при отсутствии отдельной раскладки в GDD. */
export const WEAPON_SLOT_ORDER: readonly WeaponId[] = [
  'item.pistol_ogryzok',
  'item.shotgun_duplo',
  'item.wrench_kran',
];

/** «Каждый 3-й удар подряд по одной цели оглушает её на 0,5 с» (§3.1, «Кран»). */
export const WRENCH_STUN_EVERY_HITS = 3;
export const WRENCH_STUN_MS = 500;

/**
 * Скорость снаряда, тайлов/сек — GDD не задаёт её явно (даёт только
 * скорострельность/урон/конус, не физику полёта пули), плейсхолдер по тому
 * же принципу, что `DEFAULT_HERO_SPEED` в `map-loader.ts`: снаряды летят
 * быстро относительно героя (4 тайла/с), чтобы попадание ощущалось мгновенным.
 */
export const PROJECTILE_SPEED_TILES_PER_SEC: Readonly<Record<WeaponId, number>> = {
  'item.pistol_ogryzok': 18,
  'item.shotgun_duplo': 16,
  'item.wrench_kran': 0, // ближний бой не порождает снаряд
};

/** Предельная дальность полёта снаряда, тайлы (=метры) — снаряд не должен лететь по карте бесконечно, если ни во что не попал. */
export const PROJECTILE_MAX_RANGE_M = 14;

/** Радиус попадания снаряда по цели (в дополнение к `collidable.radius` цели), тайлы. */
export const PROJECTILE_HIT_RADIUS_M = 0.2;
