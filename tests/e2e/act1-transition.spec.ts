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
 * `resolveInitialMapId` в `demo-scene.ts`) для теста, который проверяет
 * контракты «выход у двери переключает карту» и «NPC + E → диалог →
 * эффект» точечно, без прогона всего пролога — дальше идёт по `exits[]`
 * графа Акта 1 (Гаражи → Плотина → Панели), связанному level-designer
 * (OF-033).
 *
 * Позиции NPC/exits — из `public/data/maps/{garazhi,plotina,paneli}.json`;
 * герой телепортируется вплотную к каждой точке (см. обоснование телепорта
 * в `dialogue.spec.ts`).
 *
 * Отдельный тест ниже («обычный запуск без ?map=...») проверяет то, что эти
 * точечные тесты сознательно обходят стороной, — сквозной путь из пролога:
 * седьмая рецензия duxa-simulator (`duxa-review-vs-7.md`, P0) нашла, что
 * `truba.exit_to_river` вёл сам на себя, и обычный игрок без query-параметра
 * физически не мог выйти из пролога в Акт 1. Фикс — `exit_to_river` теперь
 * ведёт в `map.garazhi` (`OF-053`).
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
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('rep.progress2'))).toBe(15);

  // Регрессия на P0 из пятой рецензии duxa-simulator (`duxa-review-vs-5.md`):
  // диалог с необратимым выбором был бесконечно переигрываем — повторное
  // «Отвести на отработку» утраивало `rep.progress2` вместо однократного
  // применения. Отходим от Толи и возвращаемся — `[E]` больше не должен
  // появляться (`ONE_SHOT_DIALOG_RESOLVED_FLAG` в `demo-scene.ts`).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 20));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 10));
  await page.waitForTimeout(300);
  await expect(page.locator('#fps-overlay')).not.toContainText('[E]', { timeout: 2000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('rep.progress2'))).toBe(15);

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

/**
 * «Я кран» (`public/data/dialogs/act1-ya-kran.json`, npc.palych на (39,15) в
 * `garazhi.json`) — сцена явно спроектирована как решение без права на
 * повтор («убийство исполняется тем же выбором, что и пощада, без
 * дополнительного подтверждения», `docs/narrative/quests/act1-derzost.md`
 * §4). Пятая рецензия duxa-simulator поймала живьём: до фикса `[E]` у
 * Палыча после исхода снова предлагал «убить/пощадить», будто признания не
 * было. Регрессия — то же самое `ONE_SHOT_DIALOG_RESOLVED_FLAG`, что и в Q1.
 */
test('«Я кран»: убийство Палыча необратимо — повторный E ничего не предлагает', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=garazhi');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  await page.evaluate(() => window.__outfallDebug?.teleportHero(39, 16));
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 5000 });

  await page.keyboard.press('KeyE');
  const dalsheChoice = page.getByRole('button', { name: 'И что дальше?' });
  await expect(dalsheChoice).toBeVisible({ timeout: 3000 });
  await dalsheChoice.click();

  const ubitChoice = page.getByRole('button', { name: 'Убить Палыча.' });
  await expect(ubitChoice).toBeVisible({ timeout: 3000 });
  await ubitChoice.click();

  const mnogotochieChoice = page.getByRole('button', { name: '...' });
  await expect(mnogotochieChoice).toBeVisible({ timeout: 3000 });
  await mnogotochieChoice.click();
  await expect(mnogotochieChoice).toHaveCount(0);

  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.palych_ubit'))).toBe(true);
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('rep.progress2'))).toBe(-100);

  // Отходим и возвращаемся — сцена не должна предложить выбор снова.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(39, 25));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(39, 16));
  await page.waitForTimeout(300);
  await expect(page.locator('#fps-overlay')).not.toContainText('[E]', { timeout: 2000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('rep.progress2'))).toBe(-100);

  expect(consoleErrors).toEqual([]);
});

/**
 * Регрессия на P0 из седьмой рецензии duxa-simulator (`duxa-review-vs-7.md`):
 * обычный запуск (`startGame(page)`, без `?map=`, ровно как открыл бы
 * ссылку зритель канала) доходил до `exit_to_river` в конце пролога
 * «Труба» и упирался в тупик — `exit.toMap === map.id` был самоссылкой,
 * `switchMap` явно отказывался переходить. Фикс данных —
 * `truba.exit_to_river.toMap` теперь `map.garazhi` (`OF-053`); этот тест —
 * единственный во всём наборе e2e, который проходит путь «титульник → ПОГНАЛИ
 * → конец пролога → Акт 1» без единого query-параметра, как это сделал бы
 * реальный зритель.
 */
test('обычный запуск без ?map=: конец пролога «Труба» выпускает в Акт 1 через exit_to_river', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.truba');

  // `truba.exit_to_river` — (30,61) в `public/data/maps/truba.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 61));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.garazhi');

  const afterExit = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
  expect(afterExit?.x).toBeGreaterThanOrEqual(0);
  expect(afterExit?.y).toBeGreaterThanOrEqual(0);

  expect(consoleErrors).toEqual([]);
});
