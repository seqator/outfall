import { describe, expect, it } from 'vitest';
import { createIsoProjection } from '../../../src/core/iso';
import type { Camera } from '../../../src/render/camera';
import { screenToWorldPoint } from '../../../src/render/screen-to-world';

/**
 * OF-056: `screenToWorldPoint` — чистая инверсия того, что
 * `PixiRenderer.draw()` делает с камерой (`worldRoot.position`/`scale`),
 * вынесена отдельно, чтобы не поднимать реальный Pixi/WebGL-канвас в тестах
 * (см. докстринг файла).
 */
describe('render/screen-to-world: screenToWorldPoint', () => {
  const iso = createIsoProjection();

  it('камера в начале координат, zoom=1: центр канваса — это позиция камеры в мире', () => {
    const camera: Camera = { x: 5, y: 5, zoom: 1 };
    const { wx, wy } = screenToWorldPoint(iso, camera, 800, 600, 400, 300);
    expect(wx).toBeCloseTo(5);
    expect(wy).toBeCloseTo(5);
  });

  it('обратимо относительно draw(): screenToWorld(toScreen(camera-relative)) возвращает исходную мировую точку', () => {
    const camera: Camera = { x: 10, y: -3, zoom: 1.5 };
    const canvasWidth = 1024;
    const canvasHeight = 768;

    const worldPoints = [
      { wx: 10, wy: -3 }, // сама камера — должна спроецироваться в центр канваса
      { wx: 0, wy: 0 },
      { wx: 20, wy: 15 },
      { wx: -5, wy: 8 },
    ];

    for (const world of worldPoints) {
      // Симметричная прямая проекция — то же самое, что делает `draw()`.
      const camScreen = iso.toScreen(camera.x, camera.y);
      const pointScreen = iso.toScreen(world.wx, world.wy);
      const originX = canvasWidth / 2 - camScreen.sx * camera.zoom;
      const originY = canvasHeight / 2 - camScreen.sy * camera.zoom;
      const screenX = originX + pointScreen.sx * camera.zoom;
      const screenY = originY + pointScreen.sy * camera.zoom;

      const back = screenToWorldPoint(iso, camera, canvasWidth, canvasHeight, screenX, screenY);
      expect(back.wx).toBeCloseTo(world.wx);
      expect(back.wy).toBeCloseTo(world.wy);
    }
  });

  it('zoom меняет чувствительность: при zoom=2 то же смещение экрана даёт вдвое меньшее смещение в мире', () => {
    const cameraZoom1: Camera = { x: 0, y: 0, zoom: 1 };
    const cameraZoom2: Camera = { x: 0, y: 0, zoom: 2 };

    const atCenter1 = screenToWorldPoint(iso, cameraZoom1, 800, 600, 400, 300);
    const offsetScreen1 = screenToWorldPoint(iso, cameraZoom1, 800, 600, 464, 300);
    const atCenter2 = screenToWorldPoint(iso, cameraZoom2, 800, 600, 400, 300);
    const offsetScreen2 = screenToWorldPoint(iso, cameraZoom2, 800, 600, 464, 300);

    const delta1 = Math.hypot(offsetScreen1.wx - atCenter1.wx, offsetScreen1.wy - atCenter1.wy);
    const delta2 = Math.hypot(offsetScreen2.wx - atCenter2.wx, offsetScreen2.wy - atCenter2.wy);
    expect(delta2).toBeCloseTo(delta1 / 2);
  });

  it('камера следует за целью — та же мировая точка под курсором остаётся собой при сдвиге камеры (курсор тоже двигается вместе со сценой)', () => {
    const cameraA: Camera = { x: 0, y: 0, zoom: 1 };
    const cameraB: Camera = { x: 20, y: 20, zoom: 1 };

    const worldTarget = { wx: 3, wy: 4 };
    const screenA = iso.toScreen(worldTarget.wx - cameraA.x, worldTarget.wy - cameraA.y);
    const screenB = iso.toScreen(worldTarget.wx - cameraB.x, worldTarget.wy - cameraB.y);

    const backA = screenToWorldPoint(
      iso,
      cameraA,
      800,
      600,
      400 + screenA.sx,
      300 + screenA.sy,
    );
    const backB = screenToWorldPoint(
      iso,
      cameraB,
      800,
      600,
      400 + screenB.sx,
      300 + screenB.sy,
    );

    expect(backA.wx).toBeCloseTo(worldTarget.wx);
    expect(backA.wy).toBeCloseTo(worldTarget.wy);
    expect(backB.wx).toBeCloseTo(worldTarget.wx);
    expect(backB.wy).toBeCloseTo(worldTarget.wy);
  });
});
