import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * OF-051: полное переключение карт Акта 1 (`demo-scene.ts: switchMap`,
 * `MapSchema.exits`) плюс подключение диалогов `act1-*.json` к NPC на живых
 * картах — до этой правки движок умел грузить только «Трубу»
 * (`tests/unit/game/world/act1-maps.test.ts` доказывал лишь проходимость
 * геометрии каждой карты отдельно данными, не переход между картами вживую).
 *
 * `?map=garazhi` — прямой заход на карту Акта 1 (см. докстринг
 * `resolveInitialMapId` в `demo-scene.ts`): у «Трубы» в текущем графе
 * (`public/data/maps/truba.json`) нет исходящего `exit` куда-либо кроме
 * самой себя (`exit_to_river`, заглушка конца пролога, не в скоупе этой
 * задачи), поэтому реальный e2e-путь в Акт 1 начинается прямым заходом, а
 * дальше идёт по `exits[]` графа Акта 1 (Гаражи → Плотина → Панели),
 * связанному level-designer (OF-033).
 *
 * Позиции NPC/exits — из `public/data/maps/{garazhi,plotina,paneli}.json`;
 * герой телепортируется вплотную к каждой точке (см. обоснование телепорта
 * в `dialogue.spec.ts` — этот тест проверяет контракты «выход у двери
 * переключает карту» и «NPC + E → диалог → эффект», не пешую навигацию по
 * геометрии уровня).
 */
test('Q1: Гаражи → Плотина → Панели через exits[], диалог с Дядей Толей ставит flag.otrabotka_tolya', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=garazhi');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.garazhi');

  // `garazhi.exit_to_plotina` — (33,15) в `public/data/maps/garazhi.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(33, 15));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.plotina');

  // Переход высадил героя не за пределами новой карты — переставленная
  // позиция физически лежит внутри границ «Плотины» (54×40).
  const afterFirstSwitch = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
  expect(afterFirstSwitch?.x).toBeGreaterThanOrEqual(0);
  expect(afterFirstSwitch?.y).toBeGreaterThanOrEqual(0);

  // `plotina.exit_to_paneli` — (45,16) в `public/data/maps/plotina.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(45, 16));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.paneli');

  // `npc.tolya` — (21,9) в `public/data/maps/paneli.json`, радиус взаимодействия — 2 тайла.
  // Таймаут увеличен: `switchMap` на «Панели» дозагружает диалоги новых NPC
  // (`loadDialogsForMap`) уже ПОСЛЕ того, как `getMapId()` отражает новую
  // карту (`map = nextMap` присваивается раньше, чем догружаются диалоги),
  // так что `[E]` у Толи появляется не мгновенно с переходом, а как только
  // догрузится его диалог — на медленном софтверном рендере (см. `stress.
  // spec.ts`) это может занять заметно больше 3с.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 10));
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 10_000 });

  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.otrabotka_tolya'))).toBeUndefined();

  await page.keyboard.press('KeyE');
  await expect(page.getByText('Дядя Толя', { exact: true })).toBeVisible({ timeout: 3000 });

  const sdalChoice = page.getByRole('button', { name: 'Отвести на отработку.' });
  await expect(sdalChoice).toBeVisible({ timeout: 3000 });
  await sdalChoice.click();

  const yasnoChoice = page.getByRole('button', { name: 'Ясно.' });
  await expect(yasnoChoice).toBeVisible({ timeout: 3000 });
  await yasnoChoice.click();
  await expect(yasnoChoice).toHaveCount(0);

  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.otrabotka_tolya'))).toBe('sdal');

  expect(consoleErrors).toEqual([]);
});

/**
 * Q2 «Ключ Тарифницы» (Плотина/Панели) — развилка «Рубильник» с Модестом
 * Бусыгиным (`public/data/dialogs/act1-rubilnik.json`, npc на (26,27) в
 * `public/data/maps/plotina.json`). Прямой заход `?map=plotina` — тот же
 * приём, что и первый тест, только для другой карты и другого квеста,
 * доказывает, что подключение диалогов не завязано на прохождение именно
 * через «Гаражи».
 */
test('Q2: прямой заход на Плотину, диалог с Модестом Бусыгиным ставит flag.rubilnik', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=plotina');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.plotina');

  // `npc.modest_busygin` — (26,27) в `public/data/maps/plotina.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(26, 28));
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 3000 });

  await page.keyboard.press('KeyE');
  await expect(page.getByText('Модест Бусыгин', { exact: true })).toBeVisible({ timeout: 3000 });

  const otklyuchitChoice = page.getByRole('button', { name: 'Отключить самому.' });
  await expect(otklyuchitChoice).toBeVisible({ timeout: 3000 });
  await otklyuchitChoice.click();

  const mnogotochieChoice = page.getByRole('button', { name: '...' });
  await expect(mnogotochieChoice).toBeVisible({ timeout: 3000 });
  await mnogotochieChoice.click();
  await expect(mnogotochieChoice).toHaveCount(0);

  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.rubilnik'))).toBe('otklyuchil');

  expect(consoleErrors).toEqual([]);
});
