/**
 * Загрузчик карты (OF-015): превращает провалидированный `GameMap`
 * (`src/data/schemas/map.ts`, OF-009) в сущности ECS через `World` из
 * `core/world.ts` (OF-010) — сущности стен (для будущих систем — ИИ,
 * разрушаемость), сеточные данные коллизии (для `collisionSystem`) и метки
 * спавнов NPC/врагов/предметов (потребители — OF-016/017/018, здесь только
 * позиции и ссылки на контент, без игровой логики).
 *
 * Ground-слой в ECS не превращается в сущности «тайл на сущность» — для
 * плоского статичного пола это 64×64 = 4096 сущностей без какой-либо
 * пользы (нечего запрашивать по одному тайлу пола); вместо этого его же
 * `GameMap.layers` идёт напрямую в `IRenderer.setMap` (см. `toRendererMapData`
 * ниже) — рендер строит статичную геометрию пола один раз, без ECS.
 */

import type { EntityId, World } from '../../core/world';
import type { GameMap, Vector2 } from '../../data/schemas';
import type { MapData } from '../../render';

/** Плейсхолдер скорости героя, тайлов/сек — GDD (`docs/design/combat.md`) не фиксирует базовую скорость передвижения вне боевых модификаторов; число уточнит game-designer в OF-016. */
export const DEFAULT_HERO_SPEED = 4;
/** Радиус коллизии героя-болванчика, в тайлах — примерно «плечи» персонажа при клетке 1×1. */
export const DEFAULT_HERO_RADIUS = 0.3;

export interface LoadedMap {
  readonly mapEntity: EntityId;
  readonly wallEntities: readonly EntityId[];
  readonly npcEntities: readonly EntityId[];
  readonly enemySpawnEntities: readonly EntityId[];
  readonly itemPickupEntities: readonly EntityId[];
}

function addTransform(world: World, entity: EntityId, position: Vector2): void {
  world
    .store('transform')
    .add(entity, { x: position.x, y: position.y, z: 0, prevX: position.x, prevY: position.y });
}

/**
 * Создаёт в мире: одну сущность-сетку коллизии (`mapGrid`), по сущности на
 * каждую стеновую клетку (`wall`) и по сущности-метке на каждый npc/спавн
 * врага/предмет карты (`spawnMarker`) — без какого-либо игрового поведения,
 * только позиция + ссылка на id контента для будущих систем.
 */
export function loadMapIntoWorld(world: World, map: GameMap): LoadedMap {
  const collision = new Uint8Array(map.layers.collision.length);
  for (let i = 0; i < map.layers.collision.length; i++) {
    collision[i] = map.layers.collision[i] ?? 0;
  }

  const mapEntity = world.create();
  world.store('mapGrid').add(mapEntity, { width: map.width, height: map.height, collision });

  const wallEntities: EntityId[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (collision[i] !== 1) continue;
      const entity = world.create();
      addTransform(world, entity, { x, y });
      world.store('wall').add(entity, { tileIndex: map.layers.walls[i] ?? 0 });
      wallEntities.push(entity);
    }
  }

  const npcEntities = map.npcs.map((npc) => {
    const entity = world.create();
    addTransform(world, entity, npc.position);
    world.store('spawnMarker').add(entity, { kind: 'npc', refId: npc.id });
    return entity;
  });

  const enemySpawnEntities = map.enemySpawns.map((spawn) => {
    const entity = world.create();
    addTransform(world, entity, spawn.position);
    world.store('spawnMarker').add(entity, { kind: 'enemy', refId: spawn.enemyId });
    return entity;
  });

  const itemPickupEntities = map.itemPickups.map((pickup) => {
    const entity = world.create();
    addTransform(world, entity, pickup.position);
    world.store('spawnMarker').add(entity, { kind: 'item', refId: pickup.itemId });
    return entity;
  });

  return { mapEntity, wallEntities, npcEntities, enemySpawnEntities, itemPickupEntities };
}

/**
 * Создаёт героя-болванчика: `transform` в точке спавна + `velocity`
 * (нулевая, выставляется `inputControlSystem`) + `controlled` (скорость) +
 * `collidable` (радиус для `collisionSystem`). Оружие/анимации/спрайт —
 * вне скоупа OF-015 (OF-016/020).
 */
export interface HeroSpawnOptions {
  readonly speed?: number;
  readonly radius?: number;
}

export function createHero(world: World, position: Vector2, opts: HeroSpawnOptions = {}): EntityId {
  const entity = world.create();
  addTransform(world, entity, position);
  world.store('velocity').add(entity, { vx: 0, vy: 0 });
  world.store('controlled').add(entity, { speed: opts.speed ?? DEFAULT_HERO_SPEED });
  world.store('collidable').add(entity, { radius: opts.radius ?? DEFAULT_HERO_RADIUS });
  return entity;
}

/**
 * Точка спавна героя: `MapSchema` (OF-009) не описывает отдельное поле
 * «точка спавна игрока» (только `npcs`/`enemySpawns`/`itemPickups`/`exits`)
 * — трактовка OF-015: центр карты, ближайшая проходимая клетка (BFS по
 * `layers.collision`). Настоящая точка входа с карты (`exits[].toSpawnId`)
 * — забота OF-025/027 при переходах между картами.
 */
export function findSpawnPoint(map: GameMap): Vector2 {
  const centerX = Math.floor(map.width / 2);
  const centerY = Math.floor(map.height / 2);

  const isFree = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    return map.layers.collision[y * map.width + x] === 0;
  };

  if (isFree(centerX, centerY)) return { x: centerX, y: centerY };

  const visited = new Set<string>([`${centerX},${centerY}`]);
  const queue: Array<[number, number]> = [[centerX, centerY]];
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length > 0) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of deltas) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (isFree(nx, ny)) return { x: nx, y: ny };
      queue.push([nx, ny]);
    }
  }

  // Не должно происходить на валидной игровой карте (карта целиком — стены) —
  // безопасный фолбэк вместо падения загрузчика.
  /* v8 ignore next */
  return { x: centerX, y: centerY };
}

/** `GameMap` → `MapData` для `IRenderer.setMap` — рендер не знает о `data/schemas` (граница слоёв, §1 архитектуры). */
export function toRendererMapData(map: GameMap): MapData {
  return {
    id: map.id,
    width: map.width,
    height: map.height,
    layers: {
      ground: map.layers.ground,
      walls: map.layers.walls,
      collision: map.layers.collision,
    },
  };
}
