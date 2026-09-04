/**
 * Играбельная demo-сцена вертикального среза (OF-015): склеивает `core`
 * (детерминированный тик + ECS, OF-010), загрузчик карты и героя-болванчика
 * (`world/map-loader.ts`, эта же задача), DOM-ввод (`src/input`), рендер
 * (`PixiRenderer`) и FPS-оверлей (`src/ui`) в одну работающую сцену —
 * тестовая комната 64×64 (`world/dev-fixtures.ts`), герой ходит по WASD,
 * упирается в стены. Настоящая карта «Труба» подключится сюда же в OF-025
 * (замена `createDevTestMap()` на загрузку `public/data/maps/truba.json`).
 *
 * OF-016 подключает бой: герой получает боевые компоненты поверх
 * `createHero` (здоровье/оружие/атрибуты — GDD не даёт стартовые статы
 * персонажа вне ролевой системы, OF-002/rpg-system.md, поэтому значения
 * ниже — задокументированное допущение уровня «КОСТЯК-база 5», см.
 * комментарии у констант), метки спавна врагов карты (`spawnMarker`,
 * kind: 'enemy') превращаются в боевые сущности врагов (`aiSystem.
 * spawnEnemy`), события `combat.hit`/`combat.death` дают вспышку/смерть
 * через `renderer.emitParticles`. `?stress=1` в URL — режим стресс-теста
 * (300 врагов + залп частиц) для `tests/e2e/stress.spec.ts`.
 *
 * `main.ts` — единственное место, которое трогает DOM напрямую; эта функция
 * получает уже готовые элементы и дальше сама ничего в `document` не ищет.
 */

import { createEventBus, createLoop, createSeededRng, createWorld } from '../core';
import type { EntityId, World } from '../core/world';
import type { GameMap } from '../data/schemas';
import { createDomInputSource, type DomInputHandle } from '../input';
import { clampToMapBounds, createCamera, followTarget } from '../render';
import { PixiRenderer } from '../render/pixi';
import {
  WEAPON_DEFS,
  createSimulation,
  createWeaponsComponent,
  spawnEnemy,
  type EnemyDefId,
} from '../sim';
import { createFpsOverlay } from '../ui';
import { createBrowserRaf } from './browser-raf';
import { createDevTestMap } from './world/dev-fixtures';
import { createHero, findSpawnPoint, loadMapIntoWorld, toRendererMapData } from './world/map-loader';

export interface DemoScene {
  destroy(): void;
}

/**
 * Тестовый хук для e2e (`tests/e2e/hero-movement.spec.ts`): читать точную
 * позицию героя через `page.evaluate`, а не судить о ней по скриншоту
 * канваса. Байтовое сравнение WebGL-кадров на софтверном рендерере
 * (SwiftShader — в песочнице/CI нет `/dev/dri`) недетерминировано на уровне
 * отдельных пикселей даже при неизменной сцене, так что скриншот-диффинг
 * годится только для грубой проверки «сцена вообще ожила», не для точного
 * «герой встал». Ничего игрового не меняет и не тянет тестовый код в прод —
 * просто читает уже существующий `world`.
 */
declare global {
  interface Window {
    __outfallDebug?: {
      getHeroPosition(): { x: number; y: number } | null;
    };
  }
}

/** Seed фиксирован — вертикальный срез детерминирован так же, как реплей-тест ядра (OF-010). */
const DEV_SEED = 20260101;

/**
 * Стартовые боевые статы героя — GDD не описывает создание персонажа вне
 * ролевой системы (`docs/design/rpg-system.md`), которая тоже вне скоупа
 * OF-016. Допущение: КОСТЯК-база «5» без распределения очков (Каркас 5 →
 * ХП = 40 + 8×5 = 80, `rpg-system.md` §1.1), боевые навыки — 50 (тот же
 * «средний» уровень, что GDD берёт для врагов по умолчанию, §4.1
 * combat.md), Кураж/Острота — базовые 5.
 */
const PLAYER_MAX_HP = 80;
const PLAYER_DEFAULT_SKILL = 50;
const PLAYER_DEFAULT_COURAGE = 5;
const PLAYER_DEFAULT_REFLEX = 5;

/** Три врага среза (`docs/design/combat.md` §2.1–2.3) — остальные пять `spawnMarker` refId вне скоупа OF-016 (OF-035) и молча игнорируются. */
const SLICE_ENEMY_DEF_IDS: ReadonlySet<EnemyDefId> = new Set<EnemyDefId>([
  'enemy.raki',
  'enemy.podlineiny',
  'enemy.ohrana_progress2',
]);

function attachCombatComponents(world: World, hero: EntityId): void {
  world.store('health').add(hero, { hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, armor: 0 });
  world.store('weapons').add(hero, createWeaponsComponent());
  world.store('facing').add(hero, { dirX: 1, dirY: 0 });
  world
    .store('attributes')
    .add(hero, { courage: PLAYER_DEFAULT_COURAGE, reflex: PLAYER_DEFAULT_REFLEX });
  world.store('combatSkills').add(hero, {
    guns: PLAYER_DEFAULT_SKILL,
    heavy: PLAYER_DEFAULT_SKILL,
    fists: PLAYER_DEFAULT_SKILL,
  });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 0 });
}

/** Превращает `spawnMarker`-метки карты (kind: 'enemy') в боевые сущности врагов и убирает отработанные метки. */
function spawnEnemiesFromMarkers(world: World, enemySpawnEntities: readonly EntityId[]): void {
  for (const marker of enemySpawnEntities) {
    const spawnMarker = world.store('spawnMarker').get(marker);
    const transform = world.store('transform').get(marker);
    if (!spawnMarker || !transform) continue;
    if (!SLICE_ENEMY_DEF_IDS.has(spawnMarker.refId as EnemyDefId)) continue;
    spawnEnemy(world, spawnMarker.refId as EnemyDefId, { x: transform.x, y: transform.y });
    world.destroy(marker);
  }
}

function collectFreeTiles(map: GameMap): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.layers.collision[y * map.width + x] === 0) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** `?stress=1`: спавнит `count` врагов на случайных свободных клетках — для FPS-нагрузочного теста (§8 задачи, `tests/e2e/stress.spec.ts`). */
function spawnStressEnemies(world: World, map: GameMap, count: number): void {
  const freeTiles = collectFreeTiles(map);
  const defIds: readonly EnemyDefId[] = [...SLICE_ENEMY_DEF_IDS];
  for (let i = 0; i < count && freeTiles.length > 0; i++) {
    const index = world.rng.int(0, freeTiles.length - 1);
    const tile = freeTiles[index];
    freeTiles.splice(index, 1);
    if (!tile) break;
    const defId = defIds[i % defIds.length];
    /* v8 ignore next */
    if (!defId) continue;
    spawnEnemy(world, defId, { x: tile.x + 0.5, y: tile.y + 0.5 });
  }
}

function isStressMode(): boolean {
  return new URLSearchParams(window.location.search).get('stress') === '1';
}

export async function createDemoScene(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<DemoScene> {
  const renderer = new PixiRenderer();
  await renderer.init(canvas, {
    width: root.clientWidth,
    height: root.clientHeight,
    pixelArt: true,
  });

  const events = createEventBus();
  const rng = createSeededRng(DEV_SEED);
  const world = createWorld(rng, events);

  const map = createDevTestMap();
  const loadedMap = loadMapIntoWorld(world, map);
  renderer.setMap(toRendererMapData(map));

  const spawn = findSpawnPoint(map);
  const hero = createHero(world, spawn);
  attachCombatComponents(world, hero);

  spawnEnemiesFromMarkers(world, loadedMap.enemySpawnEntities);

  const stress = isStressMode();
  if (stress) {
    spawnStressEnemies(world, map, 300);
    // Один залп частиц ~2000 штук сразу — нагрузочный сценарий пула частиц (§8 задачи).
    renderer.emitParticles({ kind: 'hit', wx: spawn.x, wy: spawn.y, count: 2000 });
  }

  // Вспышка попадания/смерти — единственная точка, где `game` слушает
  // боевые события `sim` и дёргает VFX рендера (события доставляются после
  // тика, ADR-002 §5; `sim`/`render` друг про друга не знают).
  const unsubscribeHit = world.events.on('combat.hit', (payload) => {
    renderer.emitParticles({ kind: 'hit', wx: payload.wx, wy: payload.wy, count: payload.crit ? 10 : 5 });
  });
  const unsubscribeDeath = world.events.on('combat.death', (payload) => {
    renderer.emitParticles({ kind: 'death', wx: payload.wx, wy: payload.wy, count: 18 });
  });

  const simulation = createSimulation(world);
  const input: DomInputHandle = createDomInputSource(window);
  const raf = createBrowserRaf();
  const loop = createLoop(simulation, input.source, raf);

  const camera = createCamera({ x: spawn.x, y: spawn.y, zoom: 1.5 });

  const fpsOverlay = createFpsOverlay(root);

  const unsubscribeFrame = loop.onFrame((alpha, frameDtMs) => {
    // Камера следует за героем — первая (и пока единственная) `controlled`-
    // сущность мира; интерполяция та же, что использует рендер для отрисовки
    // (§3.1), иначе камера и герой рассинхронизируются на глаз.
    let heroTransform: { x: number; y: number; prevX: number; prevY: number } | undefined;
    for (const entity of world.query('transform', 'controlled')) {
      const transform = world.store('transform').get(entity);
      if (!transform) continue;
      heroTransform = transform;
      const ix = transform.prevX + (transform.x - transform.prevX) * alpha;
      const iy = transform.prevY + (transform.y - transform.prevY) * alpha;
      followTarget(camera, ix, iy);
      break;
    }
    clampToMapBounds(camera, map.width, map.height);

    renderer.draw(world, camera, alpha);

    const fps = frameDtMs > 0 ? 1000 / frameDtMs : 0;
    let hud = `FPS: ${fps.toFixed(0)}`;
    if (heroTransform) {
      const health = world.store('health').get(hero);
      const weapons = world.store('weapons').get(hero);
      if (health && weapons) {
        const weaponDef = WEAPON_DEFS[weapons.equipped];
        const weaponState = weapons.states[weapons.equipped];
        const ammo =
          weaponDef.magazineSize !== undefined ? `${weaponState.ammo}/${weaponDef.magazineSize}` : '—';
        const weaponName = weapons.equipped.replace('item.', '');
        hud += ` | HP ${Math.ceil(health.hp)}/${health.maxHp} | ${weaponName} ${ammo}`;
      }
    }
    fpsOverlay.update(fps);
    fpsOverlay.element.textContent = hud;
  });

  loop.start();

  const handleResize = (): void => {
    renderer.resize(root.clientWidth, root.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  window.__outfallDebug = {
    getHeroPosition(): { x: number; y: number } | null {
      const transform = world.store('transform').get(hero);
      return transform ? { x: transform.x, y: transform.y } : null;
    },
  };

  return {
    destroy(): void {
      loop.stop();
      window.removeEventListener('resize', handleResize);
      unsubscribeFrame();
      unsubscribeHit();
      unsubscribeDeath();
      input.destroy();
      fpsOverlay.destroy();
      renderer.destroy();
      delete window.__outfallDebug;
    },
  };
}
