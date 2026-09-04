import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * `KeyI` открывает/закрывает экран инвентаря (OF-017/OF-027,
 * `demo-scene.ts`: `openInventory`/`closeInventory`). До этой правки клавиша
 * была замаплена (`src/input/dom-input.ts:38`), но сцена её не слушала —
 * нажатие ничего не делало (`docs/planerka/03-vs/duxa-review-vs-2.md`, P0
 * №2, «инвентарь недостижим в игре»). Проверяет и открытие/закрытие клавишей,
 * и закрытие кнопкой «ЗАКРЫТЬ [I]» внутри панели (`onClose`, `screen.ts`).
 */
test('I открывает и закрывает экран инвентаря со стартовыми предметами', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  await page.keyboard.press('KeyI');

  await expect(page.getByText('ЛИЧНЫЕ ВЕЩИ', { exact: true })).toBeVisible({ timeout: 3000 });
  // Стартовые расходники (`demo-scene.ts`, сид `inventoryState`) — доказывает,
  // что экран не просто открылся, а показывает настоящие предметы, а не пуст.
  // Ячейка сетки — `title`/`textContent` = имя предмета плюс отдельным узлом
  // количество (`render.ts` `renderCell`), поэтому матчим по `title`, а не
  // по точному тексту ячейки.
  await expect(page.locator('[title="Патроны 9 мм"]')).toBeVisible();

  await page.keyboard.press('KeyI');
  await expect(page.getByText('ЛИЧНЫЕ ВЕЩИ', { exact: true })).toHaveCount(0);

  // Повторное открытие + закрытие кнопкой панели, а не клавишей — регрессия
  // на `InventoryScreenOptions.onClose` (`screen.ts`), который раньше был
  // пустой заглушкой и не закрывал экран по клику.
  await page.keyboard.press('KeyI');
  await expect(page.getByText('ЛИЧНЫЕ ВЕЩИ', { exact: true })).toBeVisible({ timeout: 3000 });
  await page.getByRole('button', { name: 'ЗАКРЫТЬ [I]' }).click();
  await expect(page.getByText('ЛИЧНЫЕ ВЕЩИ', { exact: true })).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
