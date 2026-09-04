import { expect, test } from '@playwright/test';
import { startGame } from './helpers';

/**
 * OF-037: живая (не только данными, `tests/unit/game/world/act2-3-maps.
 * test.ts`) проверка того, что новые карты Актов 2–3 (Санаторий «Волна»,
 * НИИ «Биосток», Труба-финал) физически связаны в граф `exits[]` с уже
 * работающей сетью Акта 1 (`switchMap`/`resolveEntryPoint`, OF-051,
 * `demo-scene.ts`) — не карты-острова, а реальные переходы через реальный
 * движок.
 *
 * `resolveEntryPoint` (см. докстринг в `demo-scene.ts`) высаживает героя на
 * позиции «зеркального» `exit` целевой карты, ведущего назад на карту
 * отправления — level-designer связал граф именно так (`docs/levels/
 * 05-sanatoriy.md`/`06-nii.md`/`07-truba-final.md` §9): каждая из трёх
 * новых карт имеет ровно один `exit` назад на карту, откуда пришли, так
 * что бесшовный обратный переход проверяется тем же тестом без отдельного
 * `toSpawnId`.
 */
test('Плотина → Санаторий «Волна» через exit_to_sanatoriy и обратно', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=plotina');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.plotina');

  // `plotina.exit_to_sanatoriy` — (49,20) в `public/data/maps/plotina.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(49, 20));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.sanatoriy');

  const onSanatoriy = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
  expect(onSanatoriy?.x).toBeGreaterThanOrEqual(0);
  expect(onSanatoriy?.y).toBeGreaterThanOrEqual(0);

  // Четыре отдельных `enemySpawns[]` (`enemy.krysa_plastikovaya`) —
  // `spawnEnemiesFromMarkers` (`demo-scene.ts`) превращает `spawnMarker`
  // карты в боевых врагов при загрузке, до того как игрок дойдёт до сада.
  expect(await page.evaluate(() => window.__outfallDebug?.getEnemyCount())).toBeGreaterThanOrEqual(4);

  // Герой высажен точно на `sanatoriy.exit_to_plotina` (25,36) — «зеркало»
  // входа (`resolveEntryPoint`, OF-051), поэтому сначала отходим (иначе
  // `suppressedExitPosition` подавляет повторный выход прямо с той же
  // клетки, докстринг `demo-scene.ts`), затем возвращаемся к тому же exit.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(25, 21));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(25, 36));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.plotina');

  expect(consoleErrors).toEqual([]);
});

test('Панели/Оголённая линия → НИИ «Биосток» через exit_to_nii и обратно', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=paneli');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.__outfallDebug?.getMapId())).toBe('map.paneli');

  // `paneli.exit_to_nii` — (44,4) в `public/data/maps/paneli.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(44, 4));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.nii');

  const onNii = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
  expect(onNii?.x).toBeGreaterThanOrEqual(0);
  expect(onNii?.y).toBeGreaterThanOrEqual(0);

  // `spawn_turret_a`/`spawn_turret_b` (`enemy.avtomat_nii`) — оба живы сразу
  // после загрузки карты, до того как игрок дойдёт до охраняемого коридора.
  expect(await page.evaluate(() => window.__outfallDebug?.getEnemyCount())).toBeGreaterThanOrEqual(2);

  // Герой высажен точно на `nii.exit_to_paneli` (23,31) — «зеркало» входа
  // (`resolveEntryPoint`, OF-051); отходим, чтобы снять
  // `suppressedExitPosition`, и возвращаемся к тому же exit.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(20, 11));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__outfallDebug?.teleportHero(23, 31));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.paneli');

  expect(consoleErrors).toEqual([]);
});

/**
 * Труба-финал (`map.truba_final`) — сцена у главной задвижки (Q6,
 * `main-quest.md`), не копия карты пролога `map.truba`. Проверяем и сам
 * переход, и то, что карта физически вмещает и делает достижимым
 * (телепорт вплотную не роняет движок ни на одной из позиций — герой не
 * застревает в стене/за пределами карты) представителя каждой из трёх
 * фракционных сторон плюс Веденеева (позиции — `docs/levels/
 * 07-truba-final.md` §7/§9), а также что живой Босс-задвижка уже стоит на
 * арене сразу после загрузки карты. `[E]`-подсказка у пяти NPC финальной
 * сцены здесь не проверяется — диалоги для них ещё не существуют
 * (`public/data/dialogs/*.json`, задача OF-036); реальное условное
 * появление ровно одного NPC по `flag.storona` — задача диалоговой системы
 * Акта 3 и переключения карт, вне скоупа этого теста (та же трактовка, что
 * в докстринге `tests/unit/game/world/act2-3-maps.test.ts`).
 */
test('Плотина → Труба-финал через exit_to_truba_final, босс и все NPC сторон физически достижимы', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await startGame(page, '?map=plotina');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#fps-overlay')).toHaveText(/FPS: \d+/, { timeout: 5000 });

  // `plotina.exit_to_truba_final` — (11,29) в `public/data/maps/plotina.json`.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(11, 29));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.truba_final');

  // `spawn_boss_zadvizhka` — жив сразу после загрузки карты, до того как
  // игрок дойдёт до арены (400 ХП, `combat.md` §2.8, `enemy.boss_zadvizhka`).
  expect(await page.evaluate(() => window.__outfallDebug?.getEnemyCount())).toBeGreaterThanOrEqual(1);

  // Все 5 NPC финальной сцены (Палыч/Гриня — Прогресс-2, Зоя — Энергосбыт,
  // Соломин — Чистые, Веденеев — опционально) — герой физически может
  // подойти вплотную к каждому, не проваливаясь за карту/в стену.
  const npcPositions: ReadonlyArray<readonly [number, number]> = [
    [12, 20], // npc.palych_final
    [12, 23], // npc.grinya_final
    [20, 20], // npc.zoya_final
    [28, 20], // npc.doctor_solomin_final
    [28, 23], // npc.vedeneev_final
  ];
  for (const [x, y] of npcPositions) {
    await page.evaluate(
      ([px, py]: readonly [number, number]) => window.__outfallDebug?.teleportHero(px, py),
      [x, y] as const,
    );
    const pos = await page.evaluate(() => window.__outfallDebug?.getHeroPosition());
    expect(pos?.x).toBeCloseTo(x, 0);
    expect(pos?.y).toBeCloseTo(y, 0);
  }

  // `truba_final.exit_to_plotina` — (21,29), зеркальный обратный переход.
  await page.evaluate(() => window.__outfallDebug?.teleportHero(21, 29));
  await expect
    .poll(() => page.evaluate(() => window.__outfallDebug?.getMapId()), { timeout: 8000 })
    .toBe('map.plotina');

  expect(consoleErrors).toEqual([]);
});
