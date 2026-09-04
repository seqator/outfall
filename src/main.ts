/**
 * Единственное место, где код напрямую трогает DOM и запускает игру.
 * Всё остальное (рендер, ввод, аудио, UI) получает уже готовые элементы
 * или абстракции — см. `docs/planerka/01-concept/engine-architect.md` §2.
 *
 * Титульный экран (`docs/OUTFALL-CONCEPT.md` §6, 0–3 сек) → клик «Погнали»
 * → демо-сцена вертикального среза создаётся именно в этот момент (не
 * заранее) — простая и честная реализация «загрузка ≤ 3 с»: инициализация
 * Pixi/мира лёгкая, укладывается в бюджет без предзагрузки в фоне.
 */

import { createDemoScene } from './game';
import { createTitleScreen } from './ui';

function bootstrap(): void {
  const root = document.getElementById('app-root');
  const canvas = document.getElementById('game-canvas');

  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('main: не найдены #app-root / #game-canvas в index.html');
  }

  const titleScreen = createTitleScreen(root, () => {
    titleScreen.destroy();
    void createDemoScene(root, canvas);
  });
}

bootstrap();
