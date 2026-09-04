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
 */

export type EnemyDefId = 'enemy.raki' | 'enemy.podlineiny' | 'enemy.ohrana_progress2';
export type EnemyRole = 'rusher' | 'controller' | 'shooter';

/** Когда активна слабость: во время телеграфа атаки, в окне отката/перезарядки после неё, или всегда (см. допущение выше про Подлинейного). */
export type WeaknessWindow = 'telegraph' | 'cooldown' | 'always';

export interface EnemyAttackDef {
  readonly nameKey: string;
  /** Мс от начала телеграфа до применения урона (300–500 мс, §1/§2). */
  readonly telegraphMs: number;
  readonly damage: number;
  /** Мс отката/перезарядки атаки — у Охраны это же окно, в котором активна её слабость (§2.3). */
  readonly cooldownMs: number;
  /** Дальность атаки, тайлы (=метры, см. допущение выше). */
  readonly rangeM: number;
  /** «Бросок сети» Подлинейного — обездвиживает игрока на это время при попадании (§2.2). */
  readonly immobilizeMs?: number;
}

export interface EnemyWeaknessDef {
  /** Множитель к формуле §4.1; >1 — гарантированный бонус, не штраф. */
  readonly multiplier: number;
  readonly ignoresArmor: boolean;
  readonly window: WeaknessWindow;
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
}

const DEFAULT_ENEMY_SKILL = 50;
const AGGRO_RADIUS_M = 8;
const ENEMY_MOVE_SPEED = 2.5;

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
};
