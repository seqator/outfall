/**
 * Играбельная demo-сцена вертикального среза (OF-015): склеивает `core`
 * (детерминированный тик + ECS, OF-010), загрузчик карты и героя-болванчика
 * (`world/map-loader.ts`, эта же задача), DOM-ввод (`src/input`), рендер
 * (`PixiRenderer`) и FPS-оверлей (`src/ui`) в одну работающую сцену —
 * тестовая комната 64×64 (`world/dev-fixtures.ts`), герой ходит по WASD,
 * упирается в стены. Настоящая карта «Труба» подключится сюда же в OF-025
 * (замена `createDevTestMap()` на загрузку `public/data/maps/truba.json`).
 *
 * `main.ts` — единственное место, которое трогает DOM напрямую; эта функция
 * получает уже готовые элементы и дальше сама ничего в `document` не ищет.
 */

import { createEventBus, createLoop, createSeededRng, createWorld } from '../core';
import { createDomInputSource, type DomInputHandle } from '../input';
import { clampToMapBounds, createCamera, followTarget } from '../render';
import { PixiRenderer } from '../render/pixi';
import { createSimulation } from '../sim';
import { createFpsOverlay } from '../ui';
import { createBrowserRaf } from './browser-raf';
import { createDevTestMap } from './world/dev-fixtures';
import { createHero, findSpawnPoint, loadMapIntoWorld, toRendererMapData } from './world/map-loader';

export interface DemoScene {
  destroy(): void;
}

/** Seed фиксирован — вертикальный срез детерминирован так же, как реплей-тест ядра (OF-010). */
const DEV_SEED = 20260101;

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
  loadMapIntoWorld(world, map);
  renderer.setMap(toRendererMapData(map));

  const spawn = findSpawnPoint(map);
  createHero(world, spawn);

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
    for (const entity of world.query('transform', 'controlled')) {
      const transform = world.store('transform').get(entity);
      if (!transform) continue;
      const ix = transform.prevX + (transform.x - transform.prevX) * alpha;
      const iy = transform.prevY + (transform.y - transform.prevY) * alpha;
      followTarget(camera, ix, iy);
      break;
    }
    clampToMapBounds(camera, map.width, map.height);

    renderer.draw(world, camera, alpha);
    fpsOverlay.update(frameDtMs > 0 ? 1000 / frameDtMs : 0);
  });

  loop.start();

  const handleResize = (): void => {
    renderer.resize(root.clientWidth, root.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  return {
    destroy(): void {
      loop.stop();
      window.removeEventListener('resize', handleResize);
      unsubscribeFrame();
      input.destroy();
      fpsOverlay.destroy();
      renderer.destroy();
    },
  };
}
