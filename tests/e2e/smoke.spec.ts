import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

test('пустая сцена: canvas и FPS-оверлей рендерятся без ошибок в консоли', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);

  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);

  const fpsOverlay = page.locator('#fps-overlay');
  await expect(fpsOverlay).toBeVisible();
  await expect(fpsOverlay).toHaveText(/FPS: \d+/, { timeout: 5000 });

  expect(consoleErrors).toEqual([]);
});
