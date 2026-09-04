import { expect, type Page, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * OF-015: герой-болванчик ходит по тестовой карте 64×64 со стенами.
 * Проверяем через реальный `keydown`/`keyup` (не headless-прогон
 * симуляции — детерминизм самого шага уже покрыт `tests/integration/
 * replay.test.ts`), что: (1) сцена рендерится без ошибок консоли, (2) герой
 * реально смещается при удержании WASD, (3) движение в стену не «пробивает»
 * её насквозь — сдвиг останавливается точно на границе.
 *
 * Позиция героя читается напрямую из мира через `window.__outfallDebug`
 * (`demo-scene.ts`), а не по скриншоту канваса: байтовое сравнение
 * WebGL-кадров на софтверном рендерере (SwiftShader — нет `/dev/dri` в
 * песочнице/CI) недетерминировано на уровне пикселей даже при неизменной
 * сцене — такой тест стабильно ловил ложные «ещё двигается»/«уже встал».
 * Прямое чтение состояния игры детерминировано и не зависит от рендера.
 *
 * `?devroom=1` — тестовая комната (`src/game/world/dev-fixtures.ts`), а не
 * настоящая «Труба» (`public/data/maps/truba.json`, OF-025): этому тесту
 * важна предсказуемая, детерминированная геометрия для проверки механики
 * коллизий, а не конкретный игровой контент. Геометрия dev-room: спавн
 * (32,32) — это 2-тайловый проход (x=31/32) в горизонтальной перегородке на
 * y=32, которая иначе перекрывает всю строку от x=16 до x=47. Из-за этого
 * движение на восток или запад из спавна почти сразу упирается в саму
 * перегородку (~1 тайл) — это НЕ дальняя стена периметра. Для проверки
 * «долгого» упора в реальную стену периметра уходим на север (открытая
 * часть комнаты выше перегородки, без препятствий на этой колонке) — там до
 * стены y=0 остаётся ~32 тайла.
 */
function getHeroPosition(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => window.__outfallDebug?.getHeroPosition() ?? null);
}

async function holdKeyUntilStable(
  page: Page,
  key: string,
  axis: 'x' | 'y',
): Promise<{ x: number; y: number } | null> {
  await page.keyboard.down(key);
  let previous = await getHeroPosition(page);
  let stable = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    const current = await getHeroPosition(page);
    if (previous && current && Math.abs(current[axis] - previous[axis]) < 1e-6) {
      stable = true;
      previous = current;
      break;
    }
    previous = current;
  }
  await page.keyboard.up(key);
  expect(stable).toBe(true);
  return previous;
}

test('герой ходит по тестовой карте 64×64 и упирается в стену периметра', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?devroom=1');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  const start = await getHeroPosition(page);
  expect(start).not.toBeNull();
  expect(start?.x).toBeCloseTo(32, 0);
  expect(start?.y).toBeCloseTo(32, 0);

  // Короткое удержание — доказывает, что герой вообще реагирует на ввод
  // (сдвигается к ближайшей стене прохода перегородки, см. геометрию выше).
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  const afterBrief = await getHeroPosition(page);
  await page.keyboard.up('KeyD');
  expect(afterBrief?.x ?? 0).toBeGreaterThan((start?.x ?? 0) + 0.3);

  // Долгое удержание в открытом направлении (север) — герой должен пройти
  // ~32 тайла и упереться точно в стену периметра y=0, а не проскочить её.
  const atWall = await holdKeyUntilStable(page, 'KeyW', 'y');

  // Стеновая клетка y=0 блокирует движение, как только `floor(y - radius)`
  // достигает её (`collisionSystem` в `src/sim/systems/collision.ts`) — то
  // есть герой должен встать на y ≈ 1 + radius = 1.3 (`DEFAULT_HERO_RADIUS
  // = 0.3`, `map-loader.ts`), а не на y ≈ 0. Диапазон [1, 2) — с запасом
  // вокруг этой теоретической точки на дискретность шага тика (не привязан
  // к точной дроби, чтобы не переобучиться на конкретный тайминг кадров),
  // но заведомо доказывает: и что герой не прошёл сквозь стену (не 0 и не
  // отрицательное), и что не застрял где-то на полпути от старта (y=32).
  expect(atWall?.y).toBeGreaterThan(1);
  expect(atWall?.y).toBeLessThan(2);

  // После отпускания клавиши позиция не меняется — герой действительно стоит.
  await page.waitForTimeout(300);
  const afterRelease = await getHeroPosition(page);
  expect(afterRelease?.y).toBeCloseTo(atWall?.y ?? 0, 6);

  expect(consoleErrors).toEqual([]);
});
