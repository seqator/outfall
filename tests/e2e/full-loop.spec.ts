import { expect, test } from '@playwright/test';

/**
 * OF-028: «меню → локация → бой → диалог → сохранение → загрузка» одним
 * e2e-прогоном в реальном браузере, на настоящей локации «Труба»
 * (`public/data/maps/truba.json`, OF-025) — не набор отдельных проверок
 * механик (те покрыты `hero-movement.spec.ts`/`stress.spec.ts` на
 * детерминированной `?devroom=1`), а доказательство, что вертикальный срез
 * — это один играбельный цикл, а не разрозненные системы. Позиции/взаимодействия
 * — через `window.__outfallDebug.teleportHero` там, где важен сам контракт
 * системы, а не пешая навигация по геометрии уровня (см. обоснование в
 * `dialogue.spec.ts`).
 */
test('меню → локация → бой → диалог → сохранение → загрузка', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // 1. Меню: титульник, клик «Погнали».
  await page.goto('/');
  await expect(page.locator('#title-screen')).toBeVisible();
  await page.getByRole('button', { name: 'ПОГНАЛИ' }).click();

  // 2. Локация: настоящая «Труба» рендерится, FPS-оверлей с HUD живой.
  await expect(page.locator('#game-canvas')).toBeVisible();
  const hud = page.locator('#fps-overlay');
  await expect(hud).toHaveText(/FPS: \d+/, { timeout: 5000 });
  await expect(hud).toContainText('HP', { timeout: 3000 });

  // HUD: `FPS: N | HP h/H | <оружие> ammo/mag` — "N/M" встречается дважды
  // (HP и боезапас), поэтому берём именно последнее совпадение, а не первое.
  const readAmmo = async (): Promise<number> => {
    const text = (await hud.textContent()) ?? '';
    const matches = [...text.matchAll(/(\d+)\/\d+/g)];
    const last = matches.at(-1)?.[1];
    return last ? Number(last) : NaN;
  };

  // 3. Бой: выстрел из стартового пистолета тратит патрон из магазина.
  const ammoBeforeShot = await readAmmo();
  expect(Number.isNaN(ammoBeforeShot)).toBe(false);
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect
    .poll(readAmmo, { timeout: 3000, message: 'патрон должен потратиться после выстрела' })
    .toBeLessThan(ammoBeforeShot);
  const ammoAfterShot = await readAmmo();

  // 4. Диалог: подход к Санитару, E открывает диалог, выбор закрывает.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(38, 23));
  await expect(hud).toContainText('[E]', { timeout: 3000 });
  await page.keyboard.press('KeyE');
  const defaultChoice = page.getByRole('button', { name: /Понял\. Иду к решётке\./ });
  await expect(defaultChoice).toBeVisible({ timeout: 3000 });
  await defaultChoice.click();
  await expect(defaultChoice).toHaveCount(0);

  // 5. Сохранение: F5 фиксирует текущий боезапас.
  await page.keyboard.press('F5');

  // Стреляем ещё раз, чтобы после F5 состояние точно отличалось от сохранённого.
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect
    .poll(readAmmo, { timeout: 3000, message: 'патрон должен потратиться после второго выстрела' })
    .toBeLessThan(ammoAfterShot);

  // 6. Загрузка: F9 возвращает боезапас к сохранённому значению — сейв
  // реально применяется к тому же миру, а не только пишется в файл.
  await page.keyboard.press('F9');
  await expect.poll(readAmmo, { timeout: 3000 }).toBe(ammoAfterShot);

  expect(consoleErrors).toEqual([]);
});
