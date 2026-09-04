import { expect, test } from '@playwright/test';

/**
 * OF-015: герой-болванчик ходит по тестовой карте 64×64 со стенами.
 * Проверяем через реальный `keydown`/`keyup` (не headless-прогон
 * симуляции — детерминизм самого шага уже покрыт `tests/integration/
 * replay.test.ts`), что: (1) сцена рендерится без ошибок консоли, (2) герой
 * реально смещается на экране при удержании WASD, (3) движение в стену
 * периметра не «пробивает» её насквозь — сдвиг останавливается на границе.
 *
 * Камера в `demo-scene.ts` каждый кадр центрируется на герое и двигает всю
 * сцену (`worldRoot`) под него — поэтому «герой сдвинулся» проверяется
 * косвенно через скриншот-диффинг канваса: свободное движение меняет кадр
 * от кадра к кадру (мир едет под неподвижным героем в центре экрана), а
 * упор в стену — сцена перестаёт меняться, потому что камера больше не
 * следует за остановленной коллизией сущностью.
 */
test('герой ходит по тестовой карте 64×64 и упирается в стену периметра', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  await page.waitForTimeout(200);
  const beforeShot = await page.locator('#game-canvas').screenshot();

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(100);
  const afterMoveShot = await page.locator('#game-canvas').screenshot();

  expect(Buffer.compare(beforeShot, afterMoveShot)).not.toBe(0);

  // Гоним героя в стену периметра дольше, чем нужно, чтобы её достичь: старт
  // — гарантированно в проходе перегородки (32,32) (`dev-fixtures.ts`), до
  // восточной стены (x=63) — 31 тайл при скорости 4 тайла/с ⇒ ~7,75 с.
  // 8,5 с держим с запасом, чтобы гарантированно упереться до первого снимка.
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(8500);
  const atWallShot1 = await page.locator('#game-canvas').screenshot();
  await page.waitForTimeout(400);
  const atWallShot2 = await page.locator('#game-canvas').screenshot();
  await page.keyboard.up('KeyD');

  // У стены герой больше не смещается — камера тоже стоит: два
  // последовательных кадра совпадают (в отличие от свободного движения выше).
  expect(Buffer.compare(atWallShot1, atWallShot2)).toBe(0);

  expect(consoleErrors).toEqual([]);
});
