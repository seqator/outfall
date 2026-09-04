import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * Полный цикл: настоящая карта «Труба» (OF-025) → подход к NPC → `E`
 * открывает диалог (OF-018, `interactionSystem`/`input.interact-requested`,
 * `demo-scene.ts`) → выбор реплики закрывает диалог и возвращает управление.
 *
 * Хero телепортируется к NPC через `window.__outfallDebug.teleportHero` —
 * не идёт туда пешком по WASD. Реальная геометрия «Трубы» — забота
 * `level-designer` и меняется независимо от e2e-тестов; полноценную пешую
 * навигацию по детерминированной геометрии уже проверяет
 * `hero-movement.spec.ts` на `?devroom=1`. Этот тест проверяет другой
 * контракт: «рядом с NPC + E → диалог открывается и закрывается» — ему
 * достаточно точной телепортации.
 */
test('подход к Санитару и E открывает диалог, выбор закрывает его', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  // `npc.sanitar` стоит на (38,22) в `public/data/maps/truba.json` — встаём
  // вплотную (радиус взаимодействия — 2 тайла, `INTERACT_RADIUS` в
  // `demo-scene.ts`).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(38, 23));

  // Подсказка HUD подтверждает, что герой действительно в радиусе — до
  // нажатия E, независимо от него.
  await expect(page.locator('#fps-overlay')).toContainText('[E]', { timeout: 3000 });

  await page.keyboard.press('KeyE');

  // Диалоговый короб — единственный `<button>` с текстом реплики на экране;
  // i18n ещё не резолвит `textKey` (OF-018 TODO), поэтому речь идёт сырыми
  // ключами контента — достаточно проверить, что короб появился и в нём
  // читаемый вариант ответа.
  const defaultChoice = page.getByRole('button', { name: /choice\.default/ });
  await expect(defaultChoice).toBeVisible({ timeout: 3000 });

  await defaultChoice.click();

  // Все ветки `prolog-smotritel` терминальные (`next: null`) — выбор сразу
  // закрывает диалог, а не переводит на следующий узел.
  await expect(defaultChoice).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});
