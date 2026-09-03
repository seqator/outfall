import { clamp } from '../core/math';

/** Камера сцены: позиция в мировых координатах + масштаб. Без DOM/pixi. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(initial: Partial<Camera> = {}): Camera {
  return { x: 0, y: 0, zoom: 1, ...initial };
}

/**
 * Камера следует за целью (обычно — интерполированная позиция героя,
 * `prevX/prevY → x/y` по `alpha` кадра, OF-015). Мутирует `camera` на месте —
 * вызывается каждый кадр рендера, без аллокаций.
 */
export function followTarget(camera: Camera, targetX: number, targetY: number): void {
  camera.x = targetX;
  camera.y = targetY;
}

/**
 * Ограничивает позицию камеры границами карты (в мировых/тайловых
 * координатах, `0..width` × `0..height`) — камера не должна показывать
 * пустоту за краем карты. Упрощение: без учёта половины экрана в тайлах
 * (это зависит от zoom и соотношения сторон канваса) — для тестовой карты
 * 64×64 этого достаточно, точная подгонка под видимую область — уточнение
 * будущих задач по мере появления реального контента (OF-025).
 */
export function clampToMapBounds(camera: Camera, mapWidth: number, mapHeight: number): void {
  camera.x = clamp(camera.x, 0, mapWidth);
  camera.y = clamp(camera.y, 0, mapHeight);
}
