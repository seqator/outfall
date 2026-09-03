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

declare module '../../core/world' {
  interface Components {
    transform: TransformComponent;
    velocity: VelocityComponent;
    controlled: ControlledComponent;
    wall: WallComponent;
    collidable: CollidableComponent;
    spawnMarker: SpawnMarkerComponent;
    mapGrid: MapGridComponent;
  }
}
