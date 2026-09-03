/**
 * Каркасная сцена OF-005: пустой Pixi-канвас + FPS-оверлей. Демонстрирует
 * склейку слоёв `game → render, ui` без затрагивания `sim`/`core` (сцена
 * пуста, симуляции ещё нет — она появится в OF-010/015).
 *
 * `main.ts` — единственное место, которое трогает DOM напрямую (находит
 * canvas/root в документе); эта функция получает уже готовые элементы.
 */

import { PixiRenderer } from '../render/pixi';
import { createFpsOverlay } from '../ui';

export interface DemoScene {
  destroy(): void;
}

export async function createDemoScene(root: HTMLElement, canvas: HTMLCanvasElement): Promise<DemoScene> {
  const renderer = new PixiRenderer();
  await renderer.init(canvas, {
    width: root.clientWidth,
    height: root.clientHeight,
    pixelArt: true,
  });

  const fpsOverlay = createFpsOverlay(root);
  const unsubscribe = renderer.onFrame((deltaMs) => {
    const fps = deltaMs > 0 ? 1000 / deltaMs : 0;
    fpsOverlay.update(fps);
  });

  const handleResize = (): void => {
    renderer.resize(root.clientWidth, root.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  return {
    destroy(): void {
      window.removeEventListener('resize', handleResize);
      unsubscribe();
      fpsOverlay.destroy();
      renderer.destroy();
    },
  };
}
