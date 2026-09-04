/**
 * Статические данные врагов среза (`docs/design/combat.md` §2.1–2.3: Раки,
 * Подлинейный, Охрана кооператива «Прогресс-2» — три врага, помеченные «да»
 * в столбце «Срез»). Прямое отражение таблицы §2/подпунктов, не формула —
 * лежит рядом с `formulas/` по той же причине, что и `weapons.ts`.
 *
 * ДОПУЩЕНИЕ (единицы расстояния): GDD измеряет дистанции атак в метрах
 * (1,5 м / 4 м / 6 м), а `TransformComponent`/`collisionSystem` работают в
 * тайловых мировых координатах без отдельного коэффициента «метр → тайл»
 * (см. `map-loader.ts`: радиус героя 0,3 — «примерно „плечи“ персонажа при
 * клетке 1×1»). Трактовка OF-016: 1 тайл = 1 метр, метры GDD переносятся в
 * `rangeM`/`meleeRangeM` без пересчёта — до появления отдельного масштаба
 * карты (level-design, вне скоупа этой задачи) это самое простое
 * согласованное допущение.
 *
 * ДОПУЩЕНИЕ (слабость Подлинейного): «голая голова» (§2.2) — позиционная
 * слабость (хитбокс головы), а не временное окно, как у Раков/Охраны. В
 * текущей ECS нет системы прицельных хитбоксов частей тела (сущности —
 * круги, атаки — снаряд/дальность, не рейкаст по частям тела) — это
 * отдельная система вне скоупа OF-016. Ближайшее возможное отражение
 * числового множителя без изобретения нового геймдизайна: слабость
 * Подлинейного считается активной всегда (`window: 'always'`) — численный
 * множитель ×1,75 из GDD сохранён, а условие «нужно целиться в голову»
 * не реализовано (кандидат на отдельную задачу — прицельные хитбоксы).
 *
 * ДОПУЩЕНИЕ (радиус агро и скорость преследования): GDD описывает только
 * телеграф/урон/откат/слабость атаки, не даёт числа для «на каком
 * расстоянии враг замечает игрока» и «с какой скоростью двигается» —
 * плейсхолдеры по тому же принципу, что `DEFAULT_HERO_SPEED` в
 * `map-loader.ts`, подлежат уточнению game-designer'ом.
 *
 * OF-035 добавляет оставшихся пять врагов (§2.4–2.8 combat.md) и следует
 * тем же принципам, плюс новые допущения там, где GDD не даёт чисел вовсе
 * (не только единиц измерения):
 *
 * ДОПУЩЕНИЕ (слабость Энергосбытовца, §2.4): «оголённый контакт заземления
 * на спине» — позиционная слабость того же типа, что и «голая голова»
 * Подлинейного выше — нет системы прицельных хитбоксов частей тела, поэтому
 * `window: 'always'` по тому же прецеденту.
 *
 * ДОПУЩЕНИЕ (откат/дальность Энергосбытовца, Чистого, Крысы — §2.4/2.5/2.6):
 * GDD даёт телеграф/урон/слабость, но не откат атаки и не дальность — те же
 * недостающие числа, что уже допущены для радиуса агро/скорости выше;
 * подобраны по ощущению роли (тяжёлый враг медленнее откатывается, рой —
 * быстрее и ближе).
 *
 * ДОПУЩЕНИЕ (Чистый, §2.5 — «при попадании создаёт лужу»): единственное
 * число урона в этом абзаце GDD — 4 урона/с самой лужи; отдельного
 * «мгновенного» урона броска фляги не указано. Трактовка: бросок сам по
 * себе прямого урона не наносит, весь урон — через лужу (`hazardOnHit`,
 * `EnemyAttackDef.damage = 0` для этого врага, не участвует в формуле §4.1
 * при попадании — см. `resolveEnemyAttack` в `systems/ai.ts`).
 *
 * ДОПУЩЕНИЕ (Автомат НИИ, §2.7 — «стационарный… прямая линия»): как и у
 * Подлинейного/Раков, направленных хитбоксов/линий-рейкастов в этой ECS нет
 * (см. допущение выше) — атака резолвится тем же омнидирекциональным
 * чек-по-дальности, что и остальные враги; уникальна только роль `'turret'`
 * (не преследует игрока, см. `systems/ai.ts`). Дальность/аггро-радиус/откат
 * между выстрелами — не заданы GDD, взяты равными друг другу (турель
 * держит дистанцию бесконечно, откат между выстрелами условно небольшой).
 *
 * ДОПУЩЕНИЕ (Босс-задвижка, §2.8 — арена и цикл атаки): GDD не задаёт
 * геометрию арены и полный цикл отката между залпами (только телеграф,
 * урон, окно слабости) — см. подробности и константы в `systems/boss-ai.ts`.
 *
 * ДОПУЩЕНИЕ (`xpLevel`/`danger`, `rpg-system.md` §4 — «Опыт за врага =
 * 10 × Уровень_врага × (1 + 0,25 × Опасность)»): GDD не сопоставляет
 * конкретных врагов combat.md с «Уровнем врага»/«Опасностью» из формулы
 * прогрессии. Грубое, но монотонное по угрозе распределение по трём
 * тирам: рядовые (срез + Крыса) = уровень 1/опасность 0 (10 опыта каждый),
 * элитные/утилитарные (Энергосбытовец/Чистый/Автомат НИИ) = уровень 3/
 * опасность 1 (37,5 опыта), босс = уровень 10/опасность 3 (175 опыта).
 * Точная балансировка — зона `docs/qa/balance-report.md` (OF-040), вне
 * скоупа OF-035.
 */

export type EnemyDefId =
  | 'enemy.raki'
  | 'enemy.podlineiny'
  | 'enemy.ohrana_progress2'
  | 'enemy.energosbytovets'
  | 'enemy.chisty'
  | 'enemy.krysa_plastikovaya'
  | 'enemy.avtomat_nii'
  | 'enemy.boss_zadvizhka';

/** Совпадает с `EnemyRoleSchema` (`data/schemas/enemy.ts`) — данные контента и рантайм-таблица описывают один и тот же набор ролей §2 combat.md. */
export type EnemyRole = 'rusher' | 'controller' | 'shooter' | 'elite' | 'thrower' | 'turret' | 'boss';

/**
 * Когда активна слабость: во время телеграфа атаки, во всё окно
 * отката/перезарядки после неё, только в первые `windowMs` мс отката
 * (Автомат НИИ/Босс — «открыт N с после атаки», окно короче остатка
 * отката), или всегда (см. допущение выше про Подлинейного/Энергосбытовца).
 */
export type WeaknessWindow = 'telegraph' | 'cooldown' | 'cooldown-start' | 'always';

export interface EnemyAttackDef {
  readonly nameKey: string;
  /** Мс от начала телеграфа до применения урона (300–500 мс, §1/§2). */
  readonly telegraphMs: number;
  readonly damage: number;
  /** Мс отката/перезарядки атаки — у Охраны это же окно, в котором активна её слабость (§2.3). */
  readonly cooldownMs: number;
  /** Дальность атаки, тайлы (=метры, см. допущение выше). Для роли `'boss'` — радиус «арены» (см. `systems/boss-ai.ts`), а не дистанция удара. */
  readonly rangeM: number;
  /** «Бросок сети» Подлинейного — обездвиживает игрока на это время при попадании (§2.2). */
  readonly immobilizeMs?: number;
  /** Энергосбытовец (§2.4) — гарантированно накладывает «Шок» независимо от % урона (`formulas/shock.ts: applyForcedShockHit`). */
  readonly forcedShock?: boolean;
  /** Чистый (§2.5) — вместо мгновенного попадания создаёт персистентную зону урона («лужу») в точке цели; `damage` этого `EnemyAttackDef` не применяется (см. ДОПУЩЕНИЕ в шапке файла). */
  readonly hazardOnHit?: {
    readonly radiusM: number;
    readonly damagePerSec: number;
    readonly durationMs: number;
  };
  /** Босс-задвижка (§2.8) — радиус AoE вокруг выбранной точки арены (`systems/boss-ai.ts`); отсутствует у всех, кроме роли `'boss'`. */
  readonly aoeRadiusM?: number;
}

export interface EnemyWeaknessDef {
  /** Множитель к формуле §4.1; >1 — гарантированный бонус, не штраф. */
  readonly multiplier: number;
  readonly ignoresArmor: boolean;
  readonly window: WeaknessWindow;
  /** Только для `window: 'cooldown-start'` — сколько мс от начала отката слабость ещё активна (Автомат НИИ 1000, Босс 2000). */
  readonly windowMs?: number;
}

export interface EnemyDef {
  readonly id: EnemyDefId;
  readonly nameKey: string;
  readonly role: EnemyRole;
  readonly hp: number;
  readonly armor: number;
  /** Навык атакующего для формулы §4.1 — «принимается равным 50, если явно не указано иное» (§4.1). */
  readonly skill: number;
  readonly aggroRadiusM: number;
  readonly moveSpeed: number;
  readonly attack: EnemyAttackDef;
  readonly weakness: EnemyWeaknessDef;
  /** `Уровень_врага` для формулы опыта `rpg-system.md` §4 (см. ДОПУЩЕНИЕ в шапке файла) — используется `sim/systems/combat.ts` при убийстве. */
  readonly xpLevel: number;
  /** `Опасность` для той же формулы. */
  readonly danger: number;
}

const DEFAULT_ENEMY_SKILL = 50;
const AGGRO_RADIUS_M = 8;
const ENEMY_MOVE_SPEED = 2.5;

/** Тир опыта «рядовые» (см. ДОПУЩЕНИЕ `xpLevel`/`danger` в шапке файла). */
const BASIC_XP_LEVEL = 1;
const BASIC_XP_DANGER = 0;
/** Тир опыта «элитные/утилитарные». */
const ELITE_XP_LEVEL = 3;
const ELITE_XP_DANGER = 1;
/** Тир опыта «босс». */
const BOSS_XP_LEVEL = 10;
const BOSS_XP_DANGER = 3;

export const ENEMY_DEFS: Readonly<Record<EnemyDefId, EnemyDef>> = {
  'enemy.raki': {
    id: 'enemy.raki',
    nameKey: 'enemy.raki.name',
    role: 'rusher',
    hp: 40,
    armor: 2,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: ENEMY_MOVE_SPEED,
    xpLevel: BASIC_XP_LEVEL,
    danger: BASIC_XP_DANGER,
    attack: {
      nameKey: 'enemy.raki.attack.claw_grip',
      telegraphMs: 400,
      damage: 15,
      cooldownMs: 1500,
      rangeM: 1.5,
    },
    // мягкое брюшко открыто, пока клешня раскрыта — окно телеграфа (§2.1)
    weakness: { multiplier: 1.5, ignoresArmor: false, window: 'telegraph' },
  },
  'enemy.podlineiny': {
    id: 'enemy.podlineiny',
    nameKey: 'enemy.podlineiny.name',
    role: 'controller',
    hp: 25,
    armor: 0,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: ENEMY_MOVE_SPEED,
    xpLevel: BASIC_XP_LEVEL,
    danger: BASIC_XP_DANGER,
    attack: {
      nameKey: 'enemy.podlineiny.attack.net_throw',
      telegraphMs: 350,
      damage: 5,
      cooldownMs: 2500,
      rangeM: 4,
      immobilizeMs: 1000,
    },
    // «голая голова» — см. допущение в шапке файла
    weakness: { multiplier: 1.75, ignoresArmor: false, window: 'always' },
  },
  'enemy.ohrana_progress2': {
    id: 'enemy.ohrana_progress2',
    nameKey: 'enemy.ohrana_progress2.name',
    role: 'shooter',
    hp: 30,
    armor: 4,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: ENEMY_MOVE_SPEED,
    xpLevel: BASIC_XP_LEVEL,
    danger: BASIC_XP_DANGER,
    attack: {
      nameKey: 'enemy.ohrana_progress2.attack.obrez_shot',
      telegraphMs: 450,
      damage: 12,
      // «переламывает стволы для перезарядки на 1,6 с» — это же окно отката атаки (§2.3)
      cooldownMs: 1600,
      rangeM: 6,
    },
    // окно перезарядки после выстрела — весь откат атаки (§2.3)
    weakness: { multiplier: 2, ignoresArmor: false, window: 'cooldown' },
  },

  // --- OF-035: пять врагов, помеченных «позже» в §2 combat.md ---

  'enemy.energosbytovets': {
    id: 'enemy.energosbytovets',
    nameKey: 'enemy.energosbytovets.name',
    role: 'elite',
    hp: 45,
    armor: 6,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: ENEMY_MOVE_SPEED,
    xpLevel: ELITE_XP_LEVEL,
    danger: ELITE_XP_DANGER,
    attack: {
      nameKey: 'enemy.energosbytovets.attack.dubinka',
      telegraphMs: 500, // «самый долгий телеграф в игре» (§2.4)
      damage: 20,
      cooldownMs: 1800, // ДОПУЩЕНИЕ: откат не задан GDD — тяжелее и медленнее отката Раков (1500)
      rangeM: 1.8, // ДОПУЩЕНИЕ: дальность не задана GDD, чуть больше Раков (крупнее враг)
      forcedShock: true, // «независимо от % потерянного ХП» (§2.4)
    },
    // «оголённый контакт заземления на спине» — см. ДОПУЩЕНИЕ в шапке файла (аналог Подлинейного)
    weakness: { multiplier: 2, ignoresArmor: false, window: 'always' },
  },

  'enemy.chisty': {
    id: 'enemy.chisty',
    nameKey: 'enemy.chisty.name',
    role: 'thrower',
    hp: 20,
    armor: 0,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: ENEMY_MOVE_SPEED,
    xpLevel: ELITE_XP_LEVEL,
    danger: ELITE_XP_DANGER,
    attack: {
      nameKey: 'enemy.chisty.attack.flyaga_throw',
      telegraphMs: 350,
      damage: 0, // весь урон — через лужу, см. ДОПУЩЕНИЕ в шапке файла
      cooldownMs: 2000, // ДОПУЩЕНИЕ: откат не задан GDD
      rangeM: 4, // ДОПУЩЕНИЕ: дальность броска не задана числом — взята равной дуге сети Подлинейного (та же по духу «дуга»-атака)
      hazardOnHit: { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 },
    },
    // «бьёт по своей же фляге» — во время замаха (§2.5)
    weakness: { multiplier: 3, ignoresArmor: false, window: 'telegraph' },
  },

  'enemy.krysa_plastikovaya': {
    id: 'enemy.krysa_plastikovaya',
    nameKey: 'enemy.krysa_plastikovaya.name',
    role: 'rusher',
    hp: 8,
    armor: 0,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: AGGRO_RADIUS_M,
    moveSpeed: 3.2, // ДОПУЩЕНИЕ: «самый быстрый враг в игре» (§2.6) — быстрее ENEMY_MOVE_SPEED
    xpLevel: BASIC_XP_LEVEL,
    danger: BASIC_XP_DANGER,
    attack: {
      nameKey: 'enemy.krysa_plastikovaya.attack.ukus',
      telegraphMs: 300, // «минимальный в игре» (§2.6)
      damage: 6,
      cooldownMs: 900, // ДОПУЩЕНИЕ: откат не задан GDD — быстрее Раков, свара кусает чаще
      rangeM: 1.0, // ДОПУЩЕНИЕ: дальность не задана GDD — мельче Раков
    },
    // «любое попадание» — буквально всегда, не приближение (§2.6)
    weakness: { multiplier: 1.5, ignoresArmor: false, window: 'always' },
  },

  'enemy.avtomat_nii': {
    id: 'enemy.avtomat_nii',
    nameKey: 'enemy.avtomat_nii.name',
    role: 'turret',
    hp: 35,
    armor: 8,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: 12, // ДОПУЩЕНИЕ: см. ДОПУЩЕНИЕ (Автомат НИИ) в шапке файла — чуть больше rangeM (замечает раньше, чем достаёт лучом)
    moveSpeed: 0, // стационарен (§2.7)
    xpLevel: ELITE_XP_LEVEL,
    danger: ELITE_XP_DANGER,
    attack: {
      nameKey: 'enemy.avtomat_nii.attack.lazer',
      telegraphMs: 500,
      damage: 16,
      cooldownMs: 2000, // ДОПУЩЕНИЕ: откат между выстрелами не задан GDD
      rangeM: 10, // ДОПУЩЕНИЕ: дальность лазера не задана числом
    },
    // «радиатор открыт 1 с после выстрела» — первые 1000 мс отката (§2.7)
    weakness: { multiplier: 2.5, ignoresArmor: true, window: 'cooldown-start', windowMs: 1000 },
  },

  'enemy.boss_zadvizhka': {
    id: 'enemy.boss_zadvizhka',
    nameKey: 'enemy.boss_zadvizhka.name',
    role: 'boss',
    hp: 400,
    armor: 10,
    skill: DEFAULT_ENEMY_SKILL,
    aggroRadiusM: 10, // ДОПУЩЕНИЕ: см. `systems/boss-ai.ts` — радиус «арены», равен rangeM
    moveSpeed: 0, // стационарен (§2.8)
    xpLevel: BOSS_XP_LEVEL,
    danger: BOSS_XP_DANGER,
    attack: {
      nameKey: 'enemy.boss_zadvizhka.attack.vodyanoy_zalp',
      telegraphMs: 500, // «максимум диапазона, читается однозначно» (§2.8)
      damage: 25,
      cooldownMs: 4000, // ДОПУЩЕНИЕ: полный цикл атаки не задан GDD — см. `systems/boss-ai.ts`
      rangeM: 10, // радиус «арены» — см. ДОПУЩЕНИЕ в шапке файла
      aoeRadiusM: 3, // радиус AoE самого залпа (§2.8)
    },
    // «шток открыт 2 с после атаки» — первые 2000 мс отката (§2.8)
    weakness: { multiplier: 3, ignoresArmor: true, window: 'cooldown-start', windowMs: 2000 },
  },
};
