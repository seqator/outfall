import { expect, type Page } from '@playwright/test';
import { test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Финальная сцена задвижки (`map.truba_final`, `trigger_final_valve`,
 * `docs/narrative/quests/act2-act3.md` §4.1) — единственная сцена волны
 * Актов 2-3, объявленная сюжетно срочной, поэтому реалтайм-оверлей поверх
 * геймплея (тот же принцип, что и сцена Родиона в прологе,
 * `tests/e2e/rodion-scene.spec.ts`), а не диалоговое меню. Три ветки исхода
 * `E` зависят от `flag.storona` (Q5 «Кому качать»), поэтому каждый тест
 * сперва честно присягает нужному лидеру через настоящий диалог (все пять
 * NPC финала стоят на одной карте `truba_final`) — не подставляет флаг в
 * обход интерфейса.
 *
 * Скрытая ветка `G` («Очень чистый», `Смекалка ≤ 3`) НЕ покрыта e2e: у
 * `window.__outfallDebug` нет способа задать характеристики героя во время
 * игры (стартовый КОСТЯК — только дефолт `createGameState()`, `Смекалка 5`
 * не проходит порог), а добавлять отладочный сеттер стата ради одного теста
 * — больше риска, чем пользы. Честно фиксируем как известный пробел.
 */

async function reachFinalValveScene(page: Page): Promise<void> {
  await startGame(page, '?map=truba_final');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
}

/**
 * Закрывает диалог присяги, кликая «...» столько раз, сколько узлов между
 * этим и `next: null` — не обязательно один (OF-054-follow-up, `duxa-review-
 * vs-8.md` §P1: узел `prisyaga_end` теперь ветвится на промежуточный
 * `shtamm0_ne_v_kurse` — мягкую реплику лидера, если игрок не был у
 * Веденеева в НИИ, `flag.shtamm0_pravda` не установлен — что верно для всех
 * тестов этого файла, они не заходят в Акт 2 перед присягой). Не завязано на
 * точное число кликов — устойчиво к тому, наступит ли `flag.shtamm0_pravda`
 * в будущем тесте этого файла.
 */
async function closePledgeDialog(page: Page): Promise<void> {
  const mnogotochie = page.getByRole('button', { name: '...' });
  for (let i = 0; i < 3; i += 1) {
    await expect(mnogotochie).toBeVisible({ timeout: 3000 });
    await mnogotochie.click();
    if ((await mnogotochie.count()) === 0) return;
  }
}

test('присяга Энергосбыту → держать E у задвижки даёт «второй сброс»', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachFinalValveScene(page);

  // `npc.zoya_final` — (20,20) в `public/data/maps/truba_final.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(20, 21));
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 5000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'Присягаю Энергосбыту.' }).click();
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.storona'))).toBe('energosbyt');
  await closePledgeDialog(page);

  // `trigger_final_valve` — (21,5), радиус 3.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 5));
  await expect(page.locator('#fps-overlay')).toContainText('Задвижка перед тобой', { timeout: 5000 });
  await expect(page.locator('#fps-overlay')).toContainText('F — довести до метки');

  await page.keyboard.down('KeyE');
  await expect(page.locator('#fps-overlay')).toContainText('Крутишь маховик', { timeout: 2000 });
  await page.waitForTimeout(7_500);
  await page.keyboard.up('KeyE');

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_deystviye')), {
      timeout: 3000,
    })
    .toBe('vtoroy_sbros');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.energosbyt_final'))).toBe('polny_sbros');
  await expect(page.locator('#fps-overlay')).toContainText('Вода уходит в Ольху', { timeout: 2000 });

  expect(consoleErrors).toEqual([]);
});

/**
 * Регрессия на P0 из шестой рецензии duxa-simulator (`duxa-review-vs-6.md`):
 * до фикса `flag.truba_deystviye` фиксировался без проверки репутации —
 * «Второй сброс» получался и с `rep.energosbyt = 0`, и никакого экрана-
 * итога не было вовсе. Тот же сценарий, что и предыдущий тест (присяга
 * Энергосбыту БЕЗ единого действия, повышающего `rep.energosbyt`, — флаг
 * стартует с 0), но здесь проверяется постоянный экран конца игры
 * (`world/endings.ts`, `resolveEnding`): при `rep.energosbyt < 20` (порог
 * пересчитан 2026-09-04 под честный максимум 25, `main-quest.md` §5, найдено
 * `duxa-review-vs-7.md` P0 №2 — прежний `< 60` был физически недостижим)
 * исход должен честно понижаться до «Чугунный век», а не показывать «Второй
 * сброс», которого игрок не заслужил.
 */
test('присяга Энергосбыту без репутации → честный экран «Чугунный век», не «Второй сброс»', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachFinalValveScene(page);
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('rep.energosbyt'))).toBeUndefined();

  await page.evaluate(() => window.__outfallDebug?.teleportHero(20, 21));
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'Присягаю Энергосбыту.' }).click();
  await closePledgeDialog(page);

  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 5));
  await expect(page.locator('#fps-overlay')).toContainText('Задвижка перед тобой', { timeout: 5000 });

  await page.keyboard.down('KeyE');
  await page.waitForTimeout(7_500);
  await page.keyboard.up('KeyE');

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_deystviye')), {
      timeout: 3000,
    })
    .toBe('vtoroy_sbros'); // физическое действие честно записано...

  // ...но постоянный экран конца игры (после того, как временная строка
  // исхода истекла) обязан понизить это до дефолта — не «Второй сброс».
  await expect(page.locator('#fps-overlay')).toContainText('КОНЕЦ ИГРЫ — «Чугунный век»', { timeout: 6000 });
  await expect(page.locator('#fps-overlay')).not.toContainText('Второй сброс');

  expect(consoleErrors).toEqual([]);
});

test('присяга Энергосбыту → F доводит вентиль до метки («по счётчику»)', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachFinalValveScene(page);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(20, 21));
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'Присягаю Энергосбыту.' }).click();
  await closePledgeDialog(page);

  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 5));
  await expect(page.locator('#fps-overlay')).toContainText('Задвижка перед тобой', { timeout: 5000 });

  await page.keyboard.press('KeyF');
  await expect(page.locator('#fps-overlay')).toContainText('дозирующий вентиль', { timeout: 2000 });

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_deystviye')), {
      timeout: 4000,
    })
    .toBe('po_schetchiku');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.energosbyt_final'))).toBe('dozirovka');

  expect(consoleErrors).toEqual([]);
});

test('присяга Чистым → держать E даёт «взрыв плотины», текст ветки свой', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachFinalValveScene(page);

  // `npc.doctor_solomin_final` — (28,20).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(28, 21));
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 5000 });
  await page.keyboard.press('KeyE');
  await page.getByRole('button', { name: 'Присягаю Чистым.' }).click();
  await closePledgeDialog(page);
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.storona'))).toBe('chistye');

  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 5));
  await expect(page.locator('#fps-overlay')).toContainText('Заряды заложены', { timeout: 5000 });
  // Ветка `chistye` не предлагает F — только E.
  await expect(page.locator('#fps-overlay')).not.toContainText('F —');

  await page.keyboard.down('KeyE');
  await expect(page.locator('#fps-overlay')).toContainText('Держишь провода вместе', { timeout: 2000 });
  await page.waitForTimeout(7_500);
  await page.keyboard.up('KeyE');

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_deystviye')), {
      timeout: 3000,
    })
    .toBe('vzryv_plotiny');
  await expect(page.locator('#fps-overlay')).toContainText('Плотина вздрагивает', { timeout: 2000 });

  expect(consoleErrors).toEqual([]);
});

test('без присяги, бездействие 18 секунд — честный форс-исход «чугунный век»', async ({ page }) => {
  test.setTimeout(30_000);
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await reachFinalValveScene(page);
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.storona'))).toBeUndefined();

  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 5));
  await expect(page.locator('#fps-overlay')).toContainText('заварить намертво', { timeout: 5000 });

  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_deystviye')), {
      timeout: 20_000,
    })
    .toBe('chugunny_vek');
  expect(await page.evaluate(() => window.__outfallDebug?.getFlag('flag.truba_final.choice_timeout'))).toBe(true);
  await expect(page.locator('#fps-overlay')).toContainText('Руки не решились', { timeout: 2000 });

  expect(consoleErrors).toEqual([]);
});
