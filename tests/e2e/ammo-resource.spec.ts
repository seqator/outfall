import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * OF-057 (P0-3 баланс-прохода, `docs/qa/balance-report.md`): «Патроны — не
 * жёсткий ресурс (`combat.md` §1), а бесконечный» — до этой правки `R`
 * пополнял магазин до полного по одному лишь нажатию, без единой проверки
 * количества патронов где бы то ни было (`sim/systems/combat.ts:
 * handlePlayerWeapons`), инвентарь и бой были никак не связаны.
 *
 * Реальная локация «Труба» (`public/data/maps/truba.json`), без `?map=` —
 * тот же принцип, что уже применяют `item-pickup-and-heal.spec.ts`/
 * `full-loop.spec.ts`. Стартовый вещмешок героя (`demo-scene.ts`): 20
 * патронов `item.ammo_pistol` (это и есть резерв «Огрызка», см. `weapon.ammo`
 * в `public/data/items.json`), пистолет «Огрызок» экипирован по умолчанию
 * (магазин 8, `WEAPON_DEFS`). Стрельба не требует цели/попадания — снаряд
 * пистолета тратит патрон независимо от того, во что он летит, поэтому весь
 * сценарий проверяется без единого врага, только через
 * `__outfallDebug.getWeaponAmmo` (не парсит HUD-строку).
 *
 * Один прогон честно проходит через оба явно требуемых сценария подряд, тем
 * же резервом (20), без искусственной подгонки числа патронов:
 *   1. Резерва хватает на полный магазин (20 → 12 → 4) — обычная
 *      перезарядка, дважды подряд.
 *   2. Резерва (4) не хватает на всю нехватку магазина (8) — ЧАСТИЧНАЯ
 *      перезарядка: магазин пополняется только на 4, не на 8.
 *   3. Резерв 0 — перезарядка не начинается вообще, магазин остаётся 0.
 */
test('перезарядка реально ограничена резервом патронов — полная, частичная и «нечем» перезарядки подряд', async ({
  page,
}) => {
  test.setTimeout(45_000);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page);
  await expect(page.locator('#game-canvas')).toBeVisible();
  const hud = page.locator('#fps-overlay');
  await expect(hud).toHaveText(/FPS: \d+/, { timeout: 5000 });

  const getAmmo = (): Promise<{ ammo: number; reserveAmmo: number } | null | undefined> =>
    page.evaluate(() => window.__outfallDebug?.getWeaponAmmo('item.pistol_ogryzok'));

  // Стартовое состояние: магазин полон (8), резерв — стартовый вещмешок (20).
  await expect.poll(getAmmo, { timeout: 3000 }).toEqual({ ammo: 8, reserveAmmo: 20 });

  const fireUntilMagazineEmpty = async (): Promise<void> => {
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await expect
      .poll(async () => (await getAmmo())?.ammo, { timeout: 6000, message: 'магазин должен опустеть' })
      .toBe(0);
    await page.mouse.up();
  };

  const pressReloadAndWaitFor1200ms = async (): Promise<void> => {
    await page.keyboard.press('KeyR');
    // 1200 мс — `reloadMs` «Огрызка» (`WEAPON_DEFS`), плюс запас на кадр/раф.
    await page.waitForTimeout(1500);
  };

  // Цикл 1: резерв 20 ≥ нехватки 8 → полная перезарядка, резерв 20 → 12.
  await fireUntilMagazineEmpty();
  await pressReloadAndWaitFor1200ms();
  await expect.poll(getAmmo, { timeout: 3000 }).toEqual({ ammo: 8, reserveAmmo: 12 });

  // Цикл 2: резерв 12 ≥ нехватки 8 → снова полная, резерв 12 → 4.
  await fireUntilMagazineEmpty();
  await pressReloadAndWaitFor1200ms();
  await expect.poll(getAmmo, { timeout: 3000 }).toEqual({ ammo: 8, reserveAmmo: 4 });

  // Цикл 3: резерв 4 < нехватки 8 — ЧАСТИЧНАЯ перезарядка: магазин
  // пополняется до 4 (не до 8), резерв полностью уходит в 0.
  await fireUntilMagazineEmpty();
  await pressReloadAndWaitFor1200ms();
  await expect.poll(getAmmo, { timeout: 3000 }).toEqual({ ammo: 4, reserveAmmo: 0 });

  // Цикл 4: расстреливаем оставшиеся 4 — резерв уже 0. Перезарядка не
  // начинается вообще (не «сухой щелчок с задержкой», а мгновенный отказ) —
  // магазин остаётся 0 даже после ожидания дольше, чем reloadMs.
  await fireUntilMagazineEmpty();
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(1500);
  await expect.poll(getAmmo, { timeout: 3000 }).toEqual({ ammo: 0, reserveAmmo: 0 });

  expect(consoleErrors).toEqual([]);
});

/**
 * Регрессия на P1 из девятой рецензии duxa-simulator (`duxa-review-vs-9.md`
 * §0.3): до этого фикса `item.shotgun_duplo` не был зарегистрирован как
 * `Item` в `public/data/items.json` и не имел ни одной точки подбора
 * патронов — стартовые 2 патрона в магазине были всем боезапасом «Дупла» на
 * всю игру, `reserveAmmo` стартовал с `0` и оставался `0` навсегда. Фикс
 * (`OF-060`) — данные (`item.shotgun_duplo`/`item.ammo_shotgun` в
 * `items.json`, пикапы на `garazhi`/`plotina`) без единой правки кода:
 * `syncWeaponReserveAmmo` (`demo-scene.ts`) уже читал `item.weapon.ammo` из
 * реестра для любого оружия из `AMMO_WEAPON_IDS` — «Дупло» просто не имело
 * записи. Этот тест подтверждает, что реестр/пикап реально подключены, не
 * только что схема валидна.
 */
test('«Дупло» реально подбирает патроны 12-го калибра с карты, резерв больше не заперт на 0', async ({
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

  const getShotgunAmmo = (): Promise<{ ammo: number; reserveAmmo: number } | null | undefined> =>
    page.evaluate(() => window.__outfallDebug?.getWeaponAmmo('item.shotgun_duplo'));

  await expect.poll(getShotgunAmmo, { timeout: 3000 }).toEqual({ ammo: 2, reserveAmmo: 0 });

  // `pickup_ammo_shotgun_market` — (31,14) в `public/data/maps/garazhi.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(31, 14));
  await expect.poll(getShotgunAmmo, { timeout: 3000 }).toEqual({ ammo: 2, reserveAmmo: 4 });

  expect(consoleErrors).toEqual([]);
});
