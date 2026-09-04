/**
 * Экран → мир (OF-056). Чистая инверсия того, что `PixiRenderer.draw()`
 * делает с камерой при отрисовке (`worldRoot.position`/`worldRoot.scale`):
 *
 *   camScreen = iso.toScreen(camera.x, camera.y)
 *   worldRoot.scale = camera.zoom
 *   worldRoot.position = (canvasWidth/2 - camScreen.sx*zoom, canvasHeight/2 - camScreen.sy*zoom)
 *
 * Вынесена в отдельный файл (не метод `PixiRenderer`), чтобы её можно было
 * юнит-тестировать без поднятия реального Pixi `Application`/WebGL-канваса —
 * только числа, тот же принцип, что уже применяет `core/iso.ts` (см. его
 * докстринг «мышка целится туда же, куда попадает»). `PixiRenderer` и
 * `NullRenderer` — тонкие обёртки, которые подставляют сюда актуальный
 * размер канваса.
 */

import type { IsoProjection } from '../core/iso';
import type { Camera } from './camera';

export interface WorldPoint {
  readonly wx: number;
  readonly wy: number;
}

/**
 * `screenX`/`screenY` — координаты курсора относительно верхнего левого угла
 * канваса (после вычитания `canvas.getBoundingClientRect()` — эта функция
 * ничего не знает о DOM, только о числах). `canvasWidth`/`canvasHeight` —
 * видимый размер канваса в CSS-пикселях (`app.screen.width/height` у Pixi).
 * `camera` — состояние камеры НА МОМЕНТ вызова (камера меняется каждый
 * кадр — вызывающая сторона должна передавать актуальный объект, не кэш).
 */
export function screenToWorldPoint(
  iso: IsoProjection,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  screenX: number,
  screenY: number,
): WorldPoint {
  const camScreen = iso.toScreen(camera.x, camera.y);
  const originX = canvasWidth / 2 - camScreen.sx * camera.zoom;
  const originY = canvasHeight / 2 - camScreen.sy * camera.zoom;
  const localX = (screenX - originX) / camera.zoom;
  const localY = (screenY - originY) / camera.zoom;
  return iso.toWorld(localX, localY);
}
