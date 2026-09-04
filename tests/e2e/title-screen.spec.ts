import { expect, test } from '@playwright/test';

/**
 * `docs/OUTFALL-CONCEPT.md` §6, 0–3 сек: титульник — название, лор-строка,
 * ОДНА кнопка «Погнали», без окон настроек/аккаунта/выбора языка. Демо-сцена
 * (канвас/FPS-оверлей) не должна существовать до клика — иначе «первые 60
 * секунд» начинаются раньше, чем игрок реально нажал «играть».
 */
test('титульник показывается первым и не запускает сцену до клика', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');

  const title = page.locator('#title-screen');
  await expect(title).toBeVisible();
  await expect(title).toContainText('OUTFALL');
  await expect(title).toContainText('Куда всё стекает');

  const startButton = page.getByRole('button', { name: 'ПОГНАЛИ' });
  await expect(startButton).toBeVisible();

  // До клика демо-сцена не создана вообще — ни канваса с содержимым, ни
  // FPS-оверлея не существует поверх титульника.
  await expect(page.locator('#fps-overlay')).toHaveCount(0);

  await startButton.click();

  await expect(title).toHaveCount(0);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  expect(consoleErrors).toEqual([]);
});
