/**
 * Самопроверка критерия готовности OF-035 «босс убивается за ≤ 3 мин в
 * плейтесте» (`docs/BACKLOG.md`). Настоящего человеческого плейтеста этот
 * тест не заменяет (число живых людей, играющих в тест-раннер, равно нулю)
 * — но он честно прогоняет весь реальный конвейер симуляции (`sim.step` →
 * `SYSTEM_ORDER`: `ai`/`movement`/`collision`/`combat`/`effects`) на
 * реальных `ENEMY_DEFS['enemy.boss_zadvizhka']`/`WEAPON_DEFS`, без единой
 * придуманной «синтетической метрики» — засекается именно игровое время
 * (`TICK_DT × число тиков`) до момента `boss.health.hp <= 0`, тем же
 * способом, что использует `tests/integration/replay.test.ts` для
 * детерминизма.
 *
 * Сценарий — «компетентный, но не идеальный игрок»: стоит на месте в 5
 * тайлах от босса (не пытается уворачиваться от AoE — HP героя намеренно
 * взят огромным, чтобы тест проверял именно скорость убийства босса, а не
 * искусство уклонения, которое уже отдельно покрыто `boss-ai.test.ts`/
 * `player-damage.test.ts` формулами i-frames/шока), перезаряжает пистолет
 * «Огрызок» (худшее по урону оружие среза) в простое и стреляет только в
 * открытое окно слабости штока (`cooldown-start`, 2000 мс после каждой
 * атаки, ×3 урона, игнорирует броню) — ровно то поведение, которое GDD и
 * рассчитывает получить от игрока, читающего телеграф (§2.8 combat.md).
 */

import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/events';
import { createInputSnapshot, type Action, type InputSnapshot } from '../../src/core/input';
import { TICK_DT } from '../../src/core/loop';
import { createSeededRng } from '../../src/core/rng';
import { createWorld, type EntityId, type World, type WorldControl } from '../../src/core/world';
import { ENEMY_DEFS } from '../../src/sim/formulas/enemies';
import { createSimulation } from '../../src/sim/simulation';
import { isEnemyWeaknessActive, spawnEnemy } from '../../src/sim/systems/ai';
import { createWeaponsComponent } from '../../src/sim/systems/combat';

/** ≤ 3 мин — буквальный критерий готовности OF-035. */
const ACCEPTANCE_LIMIT_SEC = 180;
/** Щедрый потолок тиков, чтобы зависший (не убивающий босса) сценарий падал с понятной ошибкой, а не висел бесконечно. */
const MAX_TICKS = 60 * 60 * 10; // 10 минут игрового времени

function buildWorld(): { world: World & WorldControl; hero: EntityId; boss: EntityId } {
  const rng = createSeededRng(777);
  const events = createEventBus();
  const world = createWorld(rng, events);

  const hero = world.create();
  world.store('transform').add(hero, { x: 5, y: 0, z: 0, prevX: 5, prevY: 0 });
  world.store('velocity').add(hero, { vx: 0, vy: 0 });
  world.store('controlled').add(hero, { speed: 4 });
  world.store('health').add(hero, { hp: 1_000_000, maxHp: 1_000_000, armor: 0 }); // см. докстринг файла — выживаемость не в скоупе этого сценария
  world.store('weapons').add(hero, createWeaponsComponent());
  world.store('facing').add(hero, { dirX: -1, dirY: 0 }); // смотрит на босса в (0,0)
  world.store('attributes').add(hero, { courage: 5, reflex: 5 });
  world.store('combatSkills').add(hero, { guns: 50, heavy: 50, fists: 50 });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 0 });

  const boss = spawnEnemy(world, 'enemy.boss_zadvizhka', { x: 0, y: 0 });

  return { world, hero, boss };
}

const BOSS_DEF = ENEMY_DEFS['enemy.boss_zadvizhka'];
const WEAPON_ID = 'item.pistol_ogryzok';

/** Держит огонь только в открытое окно слабости штока, иначе бережёт патроны и перезаряжается в простое. */
function buildInput(world: World, hero: EntityId, boss: EntityId): InputSnapshot {
  const weapons = world.store('weapons').get(hero);
  const bossAiState = world.store('aiState').get(boss);
  /* v8 ignore next */
  if (!weapons) return createInputSnapshot();

  const state = weapons.states[WEAPON_ID];
  const weaknessActive = bossAiState
    ? isEnemyWeaknessActive(
        BOSS_DEF.weakness.window,
        bossAiState.phase,
        bossAiState.phaseElapsedMs,
        BOSS_DEF.weakness.windowMs,
      )
    : false;

  const pressed = new Set<Action>();
  const held = new Set<Action>();
  if (weaknessActive) {
    held.add('attack');
  } else if (state.ammo === 0 && state.reloadRemainingMs <= 0) {
    pressed.add('reload');
  }
  return createInputSnapshot({ pressed, held });
}

describe('integration/boss-encounter: критерий готовности OF-035 — «босс убивается за ≤ 3 мин»', () => {
  it('стрельба строго в окно слабости штока убивает Босса-задвижку (ХП 400, Броня 10) заметно быстрее 180 секунд игрового времени', () => {
    const { world, hero, boss } = buildWorld();
    const sim = createSimulation(world);

    let ticks = 0;
    let bossHp = world.store('health').get(boss)?.hp ?? 0;
    while (ticks < MAX_TICKS && bossHp > 0) {
      const input = buildInput(world, hero, boss);
      sim.step(TICK_DT, input);
      ticks += 1;
      bossHp = world.store('health').get(boss)?.hp ?? 0;
    }

    const elapsedSec = ticks * TICK_DT;

    expect(bossHp).toBe(0); // босс действительно убит, не «время вышло»
    expect(elapsedSec).toBeLessThanOrEqual(ACCEPTANCE_LIMIT_SEC);
  });
});
