import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Режим «Арена» (OF-039, `docs/BACKLOG.md`, критерий готовности: «Арена
 * открывается из меню; рекорд переживает перезагрузку; ≥ 55 FPS на 10-й
 * волне»). ≥ 55 FPS на волне 10 не перепроверяется отдельным e2e —
 * `tests/e2e/stress.spec.ts` уже доказывает ≥ 55 FPS на 300 одновременных
 * врагах (OF-016), а самая плотная волна Арены — 6 (`map.arena_1`, «Яма»),
 * на порядок меньше; отдельный числовой стресс-тест здесь был бы
 * дублированием того же измерения без новой информации.
 *
 * `killAllEnemies()` (`window.__outfallDebug`) — тестовый хук, который
 * мгновенно завершает волну без реального боя (см. докстринг в
 * `demo-scene.ts`), тем же принципом, что уже `teleportHero` избегает
 * хрупкой пешей навигации по геометрии уровня в других e2e.
 */

test('Арена открывается из меню титульника — клик по карте доводит до реальной демо-сцены', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'ПОГНАЛИ' })).toBeVisible();

  const arenaButton = page.getByRole('button', { name: 'АРЕНА' });
  await expect(arenaButton).toBeVisible();
  await arenaButton.click();

  const menu = page.locator('#arena-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Арена: Яма');
  await expect(menu).toContainText('Арена: Двор');
  await expect(menu).toContainText('Арена: Разлив');
  await expect(menu).toContainText('рекорд: нет');

  // Порядок карточек = порядок `ARENA_MAPS` (`src/game/world/arena.ts`):
  // Яма, Двор, Разлив — вторая кнопка «В БОЙ» запускает «Двор» (map.arena_2).
  await page.getByRole('button', { name: 'В БОЙ' }).nth(1).click();

  await expect(menu).toHaveCount(0);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.arena_2');

  const arenaState = await page.evaluate(() => window.__outfallDebug?.getArenaState());
  expect(arenaState).toEqual({ wave: 1, wavesCleared: 0, finished: false });
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBeGreaterThan(0);

  expect(consoleErrors).toEqual([]);
});

test('волна 1 зачищена → спавнится волна 2 (пауза-сигнал в HUD)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=arena_1');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.arena_1');

  // Волна 1 «Ямы» — 2 рака (§1.5 08-arena.md, T1-пул, позиция 0 в тире).
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBe(2);

  await page.evaluate(() => window.__outfallDebug?.killAllEnemies());
  await expect(page.locator('#fps-overlay')).toContainText('Волна 1 зачищена', { timeout: 3000 });

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getArenaState()), { timeout: 5000 })
    .toEqual({ wave: 2, wavesCleared: 1, finished: false });
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 2000 })
    .toBeGreaterThan(0);

  expect(consoleErrors).toEqual([]);
});

/**
 * Рекорд переживает перезагрузку страницы (критерий задачи, дословно).
 * Забег: зачищаем волну 1 и 2, выходим через `exit_yama_out` (11,19) до
 * зачистки волны 3 — забег засчитывается как прерванный
 * (`finishArenaRun('left', …)`, `wavesCleared=2`), рекорд пишется в
 * `localStorage` синхронно с переходом на `map.garazhi`. Проверяем и сырое
 * содержимое `localStorage` (буквально «переживает перезагрузку»), и то,
 * что реальный код приложения читает его обратно после `page.reload()`.
 */
test('рекорд Арены переживает перезагрузку страницы', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=arena_1');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  expect(await page.evaluate(() => localStorage.getItem('outfall:arena-records:v1'))).toBeNull();

  // Волна 1 → волна 2.
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => window.__outfallDebug?.killAllEnemies());
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getArenaState()), { timeout: 5000 })
    .toMatchObject({ wave: 2, wavesCleared: 1 });

  // Волна 2 зачищена — прогресс перед выходом.
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => window.__outfallDebug?.killAllEnemies());
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getArenaState()), { timeout: 5000 })
    .toMatchObject({ wavesCleared: 2 });

  // `exit_yama_out` — (11,19) в `public/data/maps/arena_1.json`, ведёт на `map.garazhi`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(11, 19));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.garazhi');

  const rawBefore = await page.evaluate(() => localStorage.getItem('outfall:arena-records:v1'));
  expect(rawBefore).not.toBeNull();
  expect(rawBefore).toContain('map.arena_1::none');

  await page.reload();

  const rawAfter = await page.evaluate(() => localStorage.getItem('outfall:arena-records:v1'));
  expect(rawAfter).toBe(rawBefore);

  // После перезагрузки — снова титульник (не автосейв игры, обычное
  // поведение SPA); заходим в ту же карту Арены и проверяем, что РЕАЛЬНЫЙ
  // код приложения (`arenaRecordsStore` в `demo-scene.ts`, не только сырой
  // JSON) читает рекорд обратно.
  await page.getByRole('button', { name: 'ПОГНАЛИ' }).click();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  const record = await page.evaluate(() => window.__outfallDebug?.getArenaRecord('map.arena_1', []));
  expect(record?.bestWavesCleared).toBe(2);

  expect(consoleErrors).toEqual([]);
});

test('модификатор «только ножи» — герой стартует с Краном, стволы недоступны', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await page.getByRole('button', { name: 'АРЕНА' }).click();
  await page.getByRole('button', { name: 'Только ножи' }).click();
  await page.getByRole('button', { name: 'В БОЙ' }).first().click(); // «Яма» — map.arena_1

  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.arena_1');
  await expect(page.locator('#fps-overlay')).toContainText('Кран');

  // Попытка переключиться на пистолет (slot1) — модификатор фильтрует
  // `pressed`, оружие должно остаться «Краном».
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(200);
  await expect(page.locator('#fps-overlay')).toContainText('Кран');

  expect(consoleErrors).toEqual([]);
});
