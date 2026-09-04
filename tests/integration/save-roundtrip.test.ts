/**
 * OF-019 — критерий готовности: раунд-трип сейва и «сейв → перезагрузка →
 * бой продолжается». Эмулируется без `location.reload()`, как и разрешает
 * задача: сохранить состояние первого `World`, создать второй независимый
 * `World`, загрузить в него сейв и продолжить бой той же `combatSystem`.
 *
 * Допущение (см. заголовок `save-schema.ts`): врагов этот сейв не хранит —
 * задача прямо разрешает не сериализовывать ECS-сущности врагов один в один
 * для вертикального среза. «Бой продолжается» проверяется со стороны героя:
 * позиция/HP/боеприпасы/КД рывка переживают save→load и реально участвуют в
 * следующем тике `combatSystem` (не сбрасываются на дефолт).
 */

import { describe, expect, it } from 'vitest';
import { createEventBus, createInputSnapshot, createSeededRng, createWorld } from '../../src/core';
import type { World } from '../../src/core/world';
import { addItem, createEmptyInventory, createItemRegistry } from '../../src/game/inventory';
import { DEV_ITEM_IDS, rawDevItems } from '../../src/game/inventory/fixtures/dev-items';
import {
  createEmptyQuestsState,
  setQuestStage,
  startQuest,
} from '../../src/game/quest/quest-state';
import {
  applyHeroSave,
  applyWeaponsSave,
  captureHeroSave,
  captureWeaponsSave,
  createMemoryStorage,
  createSaveStore,
  CURRENT_SAVE_SCHEMA_VERSION,
  type SaveState,
} from '../../src/game/save';
import { createWeaponsComponent, createSimulation, WEAPON_DEFS } from '../../src/sim';

const SEED = 20260101;

function buildCombatHero(world: World): number {
  const hero = world.create();
  world.store('transform').add(hero, { x: 5, y: 5, z: 0, prevX: 5, prevY: 5 });
  world.store('velocity').add(hero, { vx: 0, vy: 0 });
  world.store('controlled').add(hero, { speed: 4 });
  world.store('collidable').add(hero, { radius: 0.3 });
  world.store('health').add(hero, { hp: 80, maxHp: 80, armor: 0 });
  world.store('weapons').add(hero, createWeaponsComponent());
  world.store('facing').add(hero, { dirX: 1, dirY: 0 });
  world.store('attributes').add(hero, { courage: 5, reflex: 5 });
  world.store('combatSkills').add(hero, { guns: 50, heavy: 50, fists: 50 });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 0 });
  world.store('progression').add(hero, { xp: 0, level: 1, skillPoints: 0, skillPointCursor: 0, smekalka: 5 });
  return hero;
}

describe('save round-trip: раунд-трип значимых полей', () => {
  it('позиция/HP/инвентарь/флаги эквивалентны после save() → load()', () => {
    const world = createWorld(createSeededRng(SEED), createEventBus());
    const hero = buildCombatHero(world);

    const registry = createItemRegistry(rawDevItems);
    const withBandage = addItem(createEmptyInventory(), registry, {
      itemId: DEV_ITEM_IDS.consBint,
      quantity: 2,
      uid: 'stack-bint-1',
    });
    const inventory = { ...withBandage.state, wallet: 40 };

    const flags = { 'flag.met_sanitar': true, 'flag.prolog_choice': 'spasti' };
    const quests = setQuestStage(
      startQuest(createEmptyQuestsState(), 'quest.svoi_truby'),
      'quest.svoi_truby',
      'middle',
    );

    const save: SaveState = {
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      savedAtMs: 1700000000000,
      hero: captureHeroSave(world, hero),
      weapons: captureWeaponsSave(world, hero),
      inventory,
      flags,
      quests,
      rngSeed: SEED,
      worldTick: world.tick,
    };

    const store = createSaveStore(createMemoryStorage());
    store.save(save);
    const loaded = store.load();

    expect(loaded?.hero.x).toBe(5);
    expect(loaded?.hero.y).toBe(5);
    expect(loaded?.hero.hp).toBe(80);
    expect(loaded?.inventory).toEqual(inventory);
    expect(loaded?.flags).toEqual(flags);
    expect(loaded?.quests).toEqual(quests);
  });

  it('раунд-трип через exportToFile()/importFromFile() тоже эквивалентен', () => {
    const world = createWorld(createSeededRng(SEED), createEventBus());
    const hero = buildCombatHero(world);
    const save: SaveState = {
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      savedAtMs: 1,
      hero: captureHeroSave(world, hero),
      weapons: captureWeaponsSave(world, hero),
      inventory: createEmptyInventory(),
      flags: {},
      quests: {},
      rngSeed: SEED,
      worldTick: world.tick,
    };

    const store = createSaveStore(createMemoryStorage());
    const text = store.exportToFile(save);
    const imported = store.importFromFile(text);
    expect(imported).toEqual(save);
  });
});

describe('save round-trip: сейв → новый World → бой продолжается', () => {
  it('герой продолжает бой теми же системами после загрузки в независимый World', () => {
    // --- Мир 1: герой дерётся, тратит патрон, получает урон, рывок в КД. ---
    const world1 = createWorld(createSeededRng(SEED), createEventBus());
    const hero1 = buildCombatHero(world1);
    const sim1 = createSimulation(world1);

    sim1.step(1 / 60, createInputSnapshot({ pressed: new Set(['dash']) })); // тратит рывок → КД > 0
    sim1.step(1 / 60, createInputSnapshot({ held: new Set(['attack']) })); // тратит патрон пистолета

    const healthBeforeSave = world1.store('health').get(hero1);
    if (!healthBeforeSave) throw new Error('unreachable: health only just added above');
    healthBeforeSave.hp -= 25; // «получил урон в бою» — прямая мутация компонента, как это делают системы sim

    const weaponsBeforeSave = world1.store('weapons').get(hero1);
    const ammoAfterOneShot = weaponsBeforeSave?.states['item.pistol_ogryzok'].ammo;
    expect(ammoAfterOneShot).toBe((WEAPON_DEFS['item.pistol_ogryzok'].magazineSize ?? 0) - 1);
    // Выстрел ставит КД оружия (`fireCooldownMs`) — обнуляем перед сейвом,
    // чтобы следующий тик в мире 2 сразу мог выстрелить и доказать, что
    // именно восстановленное (не свежее) состояние оружия «стреляет».
    if (weaponsBeforeSave) weaponsBeforeSave.states['item.pistol_ogryzok'].cooldownMs = 0;

    const save: SaveState = {
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      savedAtMs: 1,
      hero: captureHeroSave(world1, hero1),
      weapons: captureWeaponsSave(world1, hero1),
      inventory: createEmptyInventory(),
      flags: {},
      quests: {},
      rngSeed: SEED,
      worldTick: world1.tick,
    };
    const store = createSaveStore(createMemoryStorage());
    store.save(save);

    // Мир 1 продолжает жить своей жизнью после сохранения — снимок в `save`
    // не должен от этого измениться (см. `hero-save.ts`: копия, не ссылка).
    sim1.step(1 / 60, createInputSnapshot({ held: new Set(['attack']) }));
    expect(save.hero.hp).toBe(55);
    expect(save.weapons.states['item.pistol_ogryzok'].ammo).toBe(ammoAfterOneShot);

    // --- Мир 2: независимый мир, герой загружает сейв мира 1. ---
    const world2 = createWorld(createSeededRng(SEED), createEventBus());
    const hero2 = world2.create();
    world2.store('velocity').add(hero2, { vx: 0, vy: 0 });
    world2.store('controlled').add(hero2, { speed: 4 });
    world2.store('collidable').add(hero2, { radius: 0.3 });

    const loaded = store.load();
    if (!loaded) throw new Error('unreachable: только что сохранили этот же сейв');
    applyHeroSave(world2, hero2, loaded.hero);
    applyWeaponsSave(world2, hero2, loaded.weapons);

    expect(world2.store('health').get(hero2)?.hp).toBe(55);
    expect(world2.store('transform').get(hero2)?.x).toBe(5);
    expect(world2.store('weapons').get(hero2)?.states['item.pistol_ogryzok'].ammo).toBe(
      ammoAfterOneShot,
    );

    // Бой продолжается: выстрел в мире 2 тратит патрон от восстановленного
    // количества, а не от «свежего» полного магазина.
    const sim2 = createSimulation(world2);
    sim2.step(1 / 60, createInputSnapshot({ held: new Set(['attack']) }));
    expect(world2.store('weapons').get(hero2)?.states['item.pistol_ogryzok'].ammo).toBe(
      (ammoAfterOneShot ?? 0) - 1,
    );
  });
});
