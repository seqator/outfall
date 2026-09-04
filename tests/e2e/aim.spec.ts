import { expect, test, type Page } from '@playwright/test';
import { startGame } from './helpers';

function getHeroFacing(page: Page): Promise<{ dirX: number; dirY: number } | null> {
  return page.evaluate(() => window.__outfallDebug?.getHeroFacing() ?? null);
}

/**
 * OF-056 (P0-1 баланс-прохода, `docs/qa/balance-report.md`): прицеливание
 * должно реально следовать за курсором мыши (`aimScreen` → `renderer.
 * screenToWorld` → `InputSnapshot.aimWorld` → `sim/systems/combat.ts:
 * handlePlayerFacing`), а не только за направлением последнего WASD-
 * движения. Ни одна клавиша движения здесь ни разу не нажимается — если бы
 * прицел по-прежнему определялся `moveX/moveY` (регресс к старому
 * поведению), `facing` не изменился бы вообще ни при одном из трёх
 * `page.mouse.move()` ниже, весь тест провалился бы на первой же проверке.
 *
 * `?devroom=1` — та же детерминированная геометрия, что и в
 * `hero-movement.spec.ts`: герой стоит неподвижно в открытой части комнаты
 * (спавн (32,32), никакого движения в этом тесте), поэтому камера, следуя
 * за героем без интерполяции (герой не двигается — `transform.prevX ===
 * transform.x` каждый тик), держит его РОВНО в центре канваса каждый кадр —
 * координаты курсора относительно центра канваса напрямую и предсказуемо
 * соответствуют направлению в мире (обратная изометрическая проекция,
 * `core/iso.ts`/`render/screen-to-world.ts`, TILE_W=64/TILE_H=32): чистое
 * горизонтальное смещение курсора от центра → мировое направление
 * (dirX, -dirX) нормализованное, чистое вертикальное — (dirX, dirX).
 */
test('прицеливание следует за курсором мыши, а не за направлением движения', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?devroom=1');
  const canvas = page.locator('#game-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  // Курсор далеко справа от центра канваса (чистое горизонтальное смещение)
  // — мировое направление (1,-1) нормализованное.
  await page.mouse.move(cx + 300, cy);
  await page.waitForTimeout(200);
  const facingRight = await getHeroFacing(page);
  expect(facingRight).not.toBeNull();
  expect(facingRight?.dirX ?? 0).toBeGreaterThan(0.5);
  expect(facingRight?.dirY ?? 0).toBeLessThan(-0.5);

  // Курсор далеко слева — противоположное направление (-1,1).
  await page.mouse.move(cx - 300, cy);
  await page.waitForTimeout(200);
  const facingLeft = await getHeroFacing(page);
  expect(facingLeft).not.toBeNull();
  expect(facingLeft?.dirX ?? 0).toBeLessThan(-0.5);
  expect(facingLeft?.dirY ?? 0).toBeGreaterThan(0.5);

  // Курсор выше центра канваса (чистое вертикальное смещение вверх) —
  // мировое направление (-1,-1) нормализованное.
  await page.mouse.move(cx, cy - 300);
  await page.waitForTimeout(200);
  const facingUp = await getHeroFacing(page);
  expect(facingUp).not.toBeNull();
  expect(facingUp?.dirX ?? 0).toBeLessThan(-0.5);
  expect(facingUp?.dirY ?? 0).toBeLessThan(-0.5);

  expect(consoleErrors).toEqual([]);
});

/**
 * Кайтинг (пятиться и стрелять назад) — сердце P0-1: удерживая движение в
 * одну сторону, игрок целится/атакует в другую. Проверяем через реальный
 * выстрел: герой держит WASD в одну сторону, курсор — в противоположной от
 * движения стороне канваса; снаряд должен лететь туда, куда смотрит курсор,
 * не туда, куда бежит герой (иначе кайтинг физически невозможен, ровно та
 * находка P0-1 из `docs/qa/balance-report.md`, которую чинит эта задача).
 */
test('можно двигаться в одну сторону и целиться в другую (кайтинг)', async ({ page }) => {
  await startGame(page, '?devroom=1');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  // Целимся строго вправо от героя (мировое направление (1,-1)) ДО того, как
  // начинаем двигаться — `handlePlayerFacing` пересчитывает facing каждый
  // тик из `aimWorld`, курсор должен продолжать держать это направление, а
  // не отдавать его направлению движения.
  await page.mouse.move(cx + 300, cy);
  await page.waitForTimeout(200);

  const before = await getHeroFacing(page);
  expect(before?.dirX ?? 0).toBeGreaterThan(0.5);

  // Герой бежит на север (KeyW) — движение и прицел независимы в твинстике.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');

  const after = await getHeroFacing(page);
  // Прицел остался там же, куда смотрит курсор (курсор не двигался) — не
  // «переключился» на направление движения (0,-1), как было бы в старом,
  // сломанном поведении P0-1.
  expect(after?.dirX ?? 0).toBeGreaterThan(0.5);
  expect(after?.dirY ?? 0).toBeLessThan(-0.5);
});
