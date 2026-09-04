import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Прямая регрессия на находки `docs/planerka/03-vs/duxa-review-vs.md` п.3 и
 * `docs/qa/vs-report.md` (P0 «hero spawn point», P1 «triggers мертвы»):
 * до правки герой стартовал в центре арены боя (не в зоне A), а `triggers`
 * карты (`public/data/maps/truba.json`) не читались вообще — ни подсказки,
 * ни волны врагов по сценарию, ни крючка пролога.
 *
 * Позиции — через `teleportHero` (см. обоснование в `dialogue.spec.ts`):
 * этот тест проверяет, что триггерная система реагирует на положение
 * героя правильно, а не то, что конкретный путь по геометрии уровня
 * проходим — это разные контракты.
 */
test('старт в зоне A, триггеры T1/T3/T6 срабатывают по положению героя', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  const hud = page.locator('#fps-overlay');
  // Сцена (карта, диалоги, i18n) грузится асинхронно — `__outfallDebug`
  // появляется только после `loop.start()`, позже, чем канвас в DOM.
  await expect(hud).toHaveText(/FPS: \d+/, { timeout: 5000 });

  // Спавн — точка `S` (30,6) из `docs/levels/01-truba.md`, не геометрический
  // центр карты (32,32) — QA-отчёт поймал герой в арене боя с первых секунд.
  const start = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
  expect(start?.x).toBeCloseTo(30, 0);
  expect(start?.y).toBeCloseTo(6, 0);

  // Врагов на карте нет, пока не сработает T3 (волна) — до правки они стояли
  // с момента загрузки уровня.
  const enemiesBeforeWave = await page.evaluate(() => window.__outfallDebug?.getEnemyCount());
  expect(enemiesBeforeWave).toBe(0);

  // T1 (30,14), радиус 3 — подсказка управления.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 14));
  await expect(hud).toContainText('WASD — идти', { timeout: 3000 });

  // T2 (30,22), радиус 4 — ставит флаг water_rising, условие для T3.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 22));
  await page.waitForTimeout(300);

  // T3 (30,34), радиус 5, условие water_rising==true — спавнит волну раков.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 34));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBeGreaterThan(0);

  // T6 (30,58), радиус 4 — крючок пролога открывается автоматически, без E.
  // `prolog-kruchok.json` — два узла: реплика Санитара → узел «title» (титр
  // главы как часть того же диалога, не отдельный оверлей).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 58));
  const hookText = page.getByText('Внимание на связи', { exact: false });
  await expect(hookText).toBeVisible({ timeout: 3000 });

  const understoodButton = page.getByRole('button', { name: 'Понял.' });
  await expect(understoodButton).toBeVisible();
  await understoodButton.click();

  // Второй узел диалога — титр главы.
  await expect(page.getByText('Глава 1. Труба', { exact: false })).toBeVisible({ timeout: 2000 });
  await page.getByRole('button', { name: 'Продолжить' }).click();

  expect(consoleErrors).toEqual([]);
});
