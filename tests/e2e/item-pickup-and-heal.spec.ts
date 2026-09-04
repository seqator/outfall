import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * OF-058 (P0-4/P2-1 баланс-прохода, `docs/qa/balance-report.md`/
 * `docs/qa/vs-report.md`): до этой правки `itemPickups[]` карт были
 * физически декоративны (герой никогда не получал предмет в инвентарь), а
 * лечения не существовало вовсе (`item.cons_bint.effects: []`, ни одной
 * функции «использовать предмет» в `src/game/inventory/**`).
 *
 * Оба теста — на настоящей локации «Труба» (`public/data/maps/truba.json`),
 * без `?map=`: `startGame` заходит в кампанию так же, как реальный игрок.
 * Позиции — через `teleportHero` (обоснование см. `dialogue.spec.ts`): этот
 * файл проверяет контракт «дошёл до точки лута → предмет в инвентаре» и
 * «получил урон → аптечка лечит», не саму пешую навигацию по геометрии
 * уровня (её отдельно покрывает `hero-movement.spec.ts`).
 */

test('точка лута на карте реально подбирается в инвентарь и не выдаёт предмет повторно', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  const hud = page.locator('#fps-overlay');
  await expect(hud).toHaveText(/FPS: \d+/, { timeout: 5000 });

  // `pickup_bint` (34,44) — реальная точка лута из `truba.json`, не фикстура
  // теста: 1 «Бинт» поверх 2 стартовых (`demo-scene.ts`: стартовый
  // вещмешок) — после подбора стек должен показывать 3, не заново отдельным
  // стеком (не декаящийся предмет доливает существующий стек, `addItem`).
  const pickupFlag = 'flag.pickup:map.truba:pickup_bint';
  expect(await page.evaluate((key) => window.__outfallDebug?.getFlag(key), pickupFlag)).toBeUndefined();

  await page.evaluate(() => window.__outfallDebug?.teleportHero(34, 44));
  await expect
    .poll(() => page.evaluate((key) => window.__outfallDebug?.getFlag(key), pickupFlag), { timeout: 3000 })
    .toBe(true);

  await page.keyboard.press('KeyI');
  const bintQuantity = page.locator('[title="Аптечка «Бинт»"] span');
  await expect(bintQuantity).toHaveText('3', { timeout: 3000 });
  await page.keyboard.press('KeyI');

  // Уходим из радиуса точки лута и возвращаемся — регрессия P2-1: одна и та
  // же точка не должна выдать предмет второй раз (флаг уже стоит, ECS-метка
  // уже уничтожена, `switchMap`/повторный заход в радиус не пересоздают её).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 6));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(34, 44));
  await page.waitForTimeout(300);

  await page.keyboard.press('KeyI');
  await expect(bintQuantity).toHaveText('3', { timeout: 3000 });
  await page.keyboard.press('KeyI');

  expect(consoleErrors).toEqual([]);
});

test('урон в реальном бою → инвентарь → использовать аптечку → ХП растёт', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  const hud = page.locator('#fps-overlay');
  await expect(hud).toHaveText(/FPS: \d+/, { timeout: 5000 });

  // HUD: `FPS: N | HP h/H | <оружие> ammo/mag` — читаем именно ХП, не любую
  // пару `N/M` (в отличие от `full-loop.spec.ts`, где важен только боезапас
  // и HP там не участвует в матчинге).
  const readHp = async (): Promise<{ hp: number; maxHp: number } | null> => {
    const text = (await hud.textContent()) ?? '';
    const match = /HP (\d+)\/(\d+)/.exec(text);
    return match ? { hp: Number(match[1]), maxHp: Number(match[2]) } : null;
  };

  // T2 (30,22) ставит `flag.truba.water_rising` — условие T3 ниже.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 22));
  await page.waitForTimeout(200);

  // T3 (30,34), радиус 5 — спавнит волну раков (`truba.json: enemySpawns`).
  await page.evaluate(() => window.__outfallDebug?.teleportHero(30, 34));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getEnemyCount()), { timeout: 3000 })
    .toBeGreaterThan(0);

  // Рядом со `spawn_raki_b` (32,44) — герой стоит на месте, рак сам
  // догоняет и бьёт («Клешня», 15 урона, `combat.md` §2.1/`formulas/
  // enemies.ts`) — настоящий бой, не синтетический урон через debug-хук.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(33, 44));

  await expect
    .poll(
      async () => {
        const snapshot = await readHp();
        return snapshot ? snapshot.hp < snapshot.maxHp : false;
      },
      { timeout: 15000, message: 'герой должен получить урон в реальном бою' },
    )
    .toBe(true);
  const hpBeforeHeal = await readHp();
  expect(hpBeforeHeal).not.toBeNull();
  const hpBeforeUse = hpBeforeHeal?.hp ?? 0;
  const maxHp = hpBeforeHeal?.maxHp ?? 0;
  expect(hpBeforeUse).toBeLessThan(maxHp);

  // Инвентарь: пока открыт, `loop` на паузе (`demo-scene.ts: openInventory`)
  // — дальнейший урон от раков не идёт, следующее чтение HP отражает только
  // эффект использования аптечки, не случайные новые попадания.
  await page.keyboard.press('KeyI');
  const bintCell = page.locator('[title="Аптечка «Бинт»"]');
  await expect(bintCell).toBeVisible({ timeout: 3000 });
  await bintCell.click();
  const useButton = page.getByRole('button', { name: 'Использовать' });
  await expect(useButton).toBeVisible();
  await useButton.click();
  await page.keyboard.press('KeyI');

  const afterHeal = await readHp();
  expect(afterHeal).not.toBeNull();
  const hpAfterUse = afterHeal?.hp ?? 0;
  // +35 ХП (`items-economy.md` §4 №13), капается сверху `maxHp` — герой либо
  // реально вылечился (строго больше, чем было), либо упёрся в максимум
  // (если урон уже успел снять почти всё здоровье до открытия инвентаря) —
  // в обоих случаях `hpBeforeUse < maxHp` гарантирует, что лечение обязано
  // было что-то изменить.
  expect(hpAfterUse).toBeGreaterThan(hpBeforeUse);
  expect(hpAfterUse).toBeLessThanOrEqual(maxHp);

  expect(consoleErrors).toEqual([]);
});
