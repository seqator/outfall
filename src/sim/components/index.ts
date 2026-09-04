/**
 * Компоненты ECS — простые сериализуемые объекты (§3.2), без методов и
 * классов. Расширяют `Components` из `core/world.ts` через declaration
 * merging: каждая игровая система добавляет сюда свой кусочек интерфейса.
 *
 * OF-010 заводит только минимальный набор для примера системы движения:
 * позиция + скорость + маркер «управляется вводом». Бой/ИИ/инвентарь и
 * остальные компоненты добавляются вместе со своими системами (OF-015/016
 * и далее) — этот файл не трогают, а расширяют тем же способом ниже.
 */

/** Мировые (тайловые) координаты; `prevX/prevY` — снимок на начало тика, для интерполяции в рендере. */
export interface TransformComponent {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
}

/** Мировая скорость в тайлах/сек; выставляется системами ввода/ИИ, читается системой движения. */
export interface VelocityComponent {
  vx: number;
  vy: number;
}

/** Маркер: скорость сущности выставляется напрямую из `InputSnapshot` (игрок), а не ИИ. */
export interface ControlledComponent {
  speed: number;
}

/**
 * OF-015: карта и коллизии по сетке (§3.6 доклада engine-architect,
 * `docs/tech/architecture.md` §4). Компоненты добавляются тем же приёмом,
 * что и выше — этот блок не трогает уже существующие интерфейсы.
 */

/** Стеновая (непроходимая) клетка карты — создаётся загрузчиком карты из `layers.collision`. */
export interface WallComponent {
  /** Индекс тайла в `layers.walls` для будущего рендера тайлсетом (OF-022); сейчас — только для отладочной отрисовки. */
  tileIndex: number;
}

/**
 * Радиус AABB/circle-проверки коллизий по сетке, в тайлах. Используется
 * `collisionSystem` вместе с `transform`/`velocity` — сущности без этого
 * компонента коллизии не проверяют (например, декоративные пропсы).
 */
export interface CollidableComponent {
  radius: number;
}

/** Точка карты, требующая обработки будущими системами (бой — OF-016, инвентарь — OF-017, диалоги — OF-018). */
export type SpawnMarkerKind = 'npc' | 'enemy' | 'item';

export interface SpawnMarkerComponent {
  kind: SpawnMarkerKind;
  /** Ссылка на контент (`npc.*`/`enemy.*`/`item.*`) — сама сущность не хранит игровое поведение. */
  refId: string;
}

/**
 * Сеточные данные коллизии текущей карты — одна сущность на загруженную
 * карту (`map-loader.ts`). Хранится как `Uint8Array`, а не отдельные
 * сущности по клетке, чтобы `collisionSystem` проверял клетки без выделения
 * памяти в горячем цикле тика (см. `docs/tech/architecture.md` — бюджет
 * `sim ≤ 4 мс`).
 */
export interface MapGridComponent {
  width: number;
  height: number;
  /** row-major, 0 — проходимо, 1 — стена. Формат совпадает с `MapSchema.layers.collision`. */
  collision: Uint8Array;
}

/**
 * OF-016: бой (`docs/design/combat.md`) — здоровье/броня, боевые
 * характеристики героя, оружие с расходуемым состоянием, снаряды, i-frames
 * рывка, шок, обездвиживание (сеть Подлинейного) и состояние ИИ врага.
 * Статические данные (таблицы урона/оружия/врагов) живут в
 * `sim/formulas/weapons.ts`/`enemies.ts` — здесь только форма изменяемого
 * состояния сущности за тик.
 */

import type { EntityId } from '../../core/world';
import type { EnemyDefId } from '../formulas/enemies';
import type { WeaponId } from '../formulas/weapons';

/** Здоровье/броня — общий компонент для героя и врагов (§4.1 combat.md). */
export interface HealthComponent {
  hp: number;
  maxHp: number;
  armor: number;
}

/** Боевые навыки героя (0–100) для формулы урона/разброса (§4.1/§4.3); враги используют `EnemyDef.skill`, не этот компонент. */
export interface CombatSkillsComponent {
  guns: number;
  heavy: number;
  fists: number;
}

/** КОСТЯК-параметры героя, влияющие на бой: Кураж — крит (§4.2), Острота — рывок (§4.4). 1–10. */
export interface AttributesComponent {
  courage: number;
  reflex: number;
}

/** Направление «взгляда» сущности — прицеливание оружия дальнего боя и удар в спину (не используется в срезе, задел под нож «Стропорез»). */
export interface FacingComponent {
  dirX: number;
  dirY: number;
}

/** Расходуемое состояние одного оружия — патроны/перезарядка/КД/комбо (для «Крана»). */
export interface WeaponRuntimeState {
  /** Патронов в магазине; 0 у оружия без патронов (Кулаки) — не расходуется. */
  ammo: number;
  cooldownMs: number;
  reloadRemainingMs: number;
  /** Счётчик ударов подряд по одной цели — только «Кран» (§3.1: каждый 3-й оглушает). */
  comboHits: number;
  comboTargetId: EntityId | null;
}

/** Экипированное оружие героя + независимое расходуемое состояние каждого оружия среза (переключение slot1/2/3 не сбрасывает патроны другого оружия). */
export interface WeaponsComponent {
  equipped: WeaponId;
  states: Record<WeaponId, WeaponRuntimeState>;
}

/** Снаряд (пуля/дробь): прямолинейное движение, урон при попадании — порождается `combatSystem` при выстреле из оружия ветки «Стволы»/«Тяжёлое». */
export interface ProjectileComponent {
  ownerId: EntityId;
  dirX: number;
  dirY: number;
  /** Тайлов/сек. */
  speed: number;
  baseDamage: number;
  weaponId: WeaponId;
  /** Навык стрелка на момент выстрела — крит и разброс уже применены при спавне снаряда, а падение урона с дистанцией (§3.1 «Дупло») применяется на попадании. */
  skill: number;
  crit: 1 | 2;
  traveled: number;
  maxRangeM: number;
}

/** i-frames рывка (§4.4): пока `iframesRemainingMs > 0`, сущность неуязвима к урону. */
export interface DashStateComponent {
  iframesRemainingMs: number;
  cooldownRemainingMs: number;
}

/** Шок (§4.6): фиксированная длительность 4 с, не стекается — см. `formulas/shock.ts`. */
export interface ShockStateComponent {
  remainingMs: number;
}

/** Обездвиживание («Бросок сети» Подлинейного, §2.2): запрещает движение и рывок. */
export interface ImmobilizedComponent {
  remainingMs: number;
}

/** Фазы конечного автомата ИИ врага (§1/§2 combat.md: телеграф всегда виден до урона). */
export type AiPhase = 'idle' | 'chase' | 'telegraph' | 'attack' | 'cooldown';

export interface AiStateComponent {
  phase: AiPhase;
  phaseElapsedMs: number;
  targetId: EntityId | null;
  /** > 0 — враг оглушён (напр. 3-м ударом «Крана», §3.1) и не продвигает свою фазу. */
  stunnedMs: number;
}

/** Ссылка на статические данные врага (`ENEMY_DEFS`) — какая роль/атака/слабость у этой сущности. */
export interface EnemyComponent {
  defId: EnemyDefId;
}

declare module '../../core/world' {
  interface Components {
    transform: TransformComponent;
    velocity: VelocityComponent;
    controlled: ControlledComponent;
    wall: WallComponent;
    collidable: CollidableComponent;
    spawnMarker: SpawnMarkerComponent;
    mapGrid: MapGridComponent;
    health: HealthComponent;
    combatSkills: CombatSkillsComponent;
    attributes: AttributesComponent;
    facing: FacingComponent;
    weapons: WeaponsComponent;
    projectile: ProjectileComponent;
    dashState: DashStateComponent;
    shockState: ShockStateComponent;
    immobilized: ImmobilizedComponent;
    aiState: AiStateComponent;
    enemy: EnemyComponent;
  }
}
