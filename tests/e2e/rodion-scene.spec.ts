import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Сцена выбора в зоне E (Родион, `trigger_t4`/`trigger_t5`) — до этой правки
 * была обычным диалоговым меню на два пункта без давления времени, P1 во
 * всех трёх рецензиях duxa-simulator (`docs/planerka/03-vs/duxa-review-vs.md`
 * → `-vs-2.md` → `-vs-3.md`). Спека чисел — `docs/levels/01-truba.md` §11
 * (game-designer): держать `E` 6с — «вытащить» (`spas`), нажать `F` — «снять
 * ключ» (`klyuch`), бездействие 15с — честный форс-исход `klyuch` с флагом
 * `flag.truba.choice_timeout`.
 *
 * Три исхода проверяются через `window.__outfallDebug.getFlag('flag.prolog_
 * vybor')`, а не через парсинг текста HUD — HUD-строки задокументированы в
 * §11.7 и меняются словесно чаще, чем сам исход-флаг, который читает
 * `main-quest.md` дальше по сюжету.
 */

async function reachRodionScene(page: import('@playwright/test').Page): Promise<void> {
  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  // `trigger_t4` (30,48), радиус 4 — запускает сцену.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 48));
  await page.waitForTimeout(300);
}

test('удержание E 6 секунд — исход «спас» (spas)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachRodionScene(page);

  await expect(page.locator('#fps-overlay')).toContainText('Родион тонет', { timeout: 3000 });

  // Родион (30,52) — в радиусе interact (2 тайла).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 52));
  await page.keyboard.down('KeyE');
  await expect(page.locator('#fps-overlay')).toContainText('Тащишь Родиона', { timeout: 2000 });
  await page.waitForTimeout(6500);
  await page.keyboard.up('KeyE');

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.prolog_vybor')), {
      timeout: 3000,
    })
    .toBe('spas');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba.choice_timeout'))).toBeUndefined();
  await expect(page.locator('#fps-overlay')).toContainText('Родион свободен', { timeout: 2000 });

  expect(consoleErrors).toEqual([]);
});

test('F рядом с Родионом — осознанный исход «ключ» (klyuch), без таймаута', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachRodionScene(page);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 52));
  await page.keyboard.press('KeyF');

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.prolog_vybor')), {
      timeout: 3000,
    })
    .toBe('klyuch');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba.choice_timeout'))).toBeUndefined();
  await expect(page.locator('#fps-overlay')).toContainText('Латунный ключ у тебя', { timeout: 2000 });

  // Ключ реально лежит в вещмешке — не только в абстрактном `gameState.inventory`.
  await page.keyboard.press('KeyI');
  await expect(page.locator('[title="Латунный ключ шлюза"]')).toBeVisible({ timeout: 3000 });

  expect(consoleErrors).toEqual([]);
});

test('бездействие 15 секунд — форс-исход «ключ» с флагом таймаута', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachRodionScene(page);
  // Ничего не нажимаем — герой стоит в зоне E, таймер сцены сам доходит до нуля.

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.prolog_vybor')), {
      timeout: 18_000,
    })
    .toBe('klyuch');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba.choice_timeout'))).toBe(true);
  await expect(page.locator('#fps-overlay')).toContainText('Вода сомкнулась над Родионом', {
    timeout: 2000,
  });

  expect(consoleErrors).toEqual([]);
});
