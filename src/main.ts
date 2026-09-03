/**
 * Единственное место, где код напрямую трогает DOM и запускает игру.
 * Всё остальное (рендер, ввод, аудио, UI) получает уже готовые элементы
 * или абстракции — см. `docs/planerka/01-concept/engine-architect.md` §2.
 */

import { createDemoScene } from './game';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app-root');
  const canvas = document.getElementById('game-canvas');

  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('main: не найдены #app-root / #game-canvas в index.html');
  }

  await createDemoScene(root, canvas);
}

void bootstrap();
