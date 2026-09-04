import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS } from '../../../../src/sim/formulas/enemies';

describe('sim/formulas/enemies: ENEMY_DEFS (combat.md §2.1–2.3, три врага среза)', () => {
  it('Раки: ХП 40, Броня 2, телеграф 400 мс, урон 15, откат 1500 мс, слабость ×1,5 во время телеграфа', () => {
    const def = ENEMY_DEFS['enemy.raki'];
    expect(def.hp).toBe(40);
    expect(def.armor).toBe(2);
    expect(def.attack.telegraphMs).toBe(400);
    expect(def.attack.damage).toBe(15);
    expect(def.attack.cooldownMs).toBe(1500);
    expect(def.weakness).toEqual({ multiplier: 1.5, ignoresArmor: false, window: 'telegraph' });
  });

  it('Подлинейный: ХП 25, Броня 0, телеграф 350 мс, урон 5 + обездвиживание 1000 мс, слабость ×1,75', () => {
    const def = ENEMY_DEFS['enemy.podlineiny'];
    expect(def.hp).toBe(25);
    expect(def.armor).toBe(0);
    expect(def.attack.telegraphMs).toBe(350);
    expect(def.attack.damage).toBe(5);
    expect(def.attack.immobilizeMs).toBe(1000);
    expect(def.attack.cooldownMs).toBe(2500);
    expect(def.weakness.multiplier).toBe(1.75);
  });

  it('Охрана «Прогресс-2»: ХП 30, Броня 4, телеграф 450 мс, урон 12, окно слабости ×2 — всё время отката (перезарядка 1,6 с)', () => {
    const def = ENEMY_DEFS['enemy.ohrana_progress2'];
    expect(def.hp).toBe(30);
    expect(def.armor).toBe(4);
    expect(def.attack.telegraphMs).toBe(450);
    expect(def.attack.damage).toBe(12);
    expect(def.attack.cooldownMs).toBe(1600);
    expect(def.weakness).toEqual({ multiplier: 2, ignoresArmor: false, window: 'cooldown' });
  });

  it('телеграф каждого врага среза попадает в диапазон 300–500 мс (§1/§6)', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.attack.telegraphMs).toBeGreaterThanOrEqual(300);
      expect(def.attack.telegraphMs).toBeLessThanOrEqual(500);
    }
  });
});

describe('sim/formulas/enemies: ENEMY_DEFS (combat.md §2.4–2.8, пять врагов OF-035)', () => {
  it('Энергосбытовец: ХП 45, Броня 6, телеграф 500 мс (самый долгий), урон 20, гарантированный шок, слабость ×2', () => {
    const def = ENEMY_DEFS['enemy.energosbytovets'];
    expect(def.role).toBe('elite');
    expect(def.hp).toBe(45);
    expect(def.armor).toBe(6);
    expect(def.attack.telegraphMs).toBe(500);
    expect(def.attack.damage).toBe(20);
    expect(def.attack.forcedShock).toBe(true);
    expect(def.weakness).toMatchObject({ multiplier: 2, ignoresArmor: false, window: 'always' });
  });

  it('Чистый: ХП 20, Броня 0, телеграф 350 мс, без прямого урона (весь урон — лужа), слабость ×3 во время телеграфа', () => {
    const def = ENEMY_DEFS['enemy.chisty'];
    expect(def.role).toBe('thrower');
    expect(def.hp).toBe(20);
    expect(def.attack.telegraphMs).toBe(350);
    expect(def.attack.damage).toBe(0);
    expect(def.attack.hazardOnHit).toEqual({ radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });
    expect(def.weakness).toMatchObject({ multiplier: 3, ignoresArmor: false, window: 'telegraph' });
  });

  it('Крыса-«пластиковая»: ХП 8, Броня 0, телеграф 300 мс (минимальный), урон 6, слабость ×1,5 всегда', () => {
    const def = ENEMY_DEFS['enemy.krysa_plastikovaya'];
    expect(def.role).toBe('rusher');
    expect(def.hp).toBe(8);
    expect(def.armor).toBe(0);
    expect(def.attack.telegraphMs).toBe(300);
    expect(def.attack.damage).toBe(6);
    expect(def.weakness).toEqual({ multiplier: 1.5, ignoresArmor: false, window: 'always' });
  });

  it('Автомат НИИ: ХП 35, Броня 8, стационарен (moveSpeed 0), телеграф 500 мс, урон 16, слабость ×2,5 игнорирует броню в первую 1000 мс отката', () => {
    const def = ENEMY_DEFS['enemy.avtomat_nii'];
    expect(def.role).toBe('turret');
    expect(def.hp).toBe(35);
    expect(def.armor).toBe(8);
    expect(def.moveSpeed).toBe(0);
    expect(def.attack.telegraphMs).toBe(500);
    expect(def.attack.damage).toBe(16);
    expect(def.weakness).toEqual({ multiplier: 2.5, ignoresArmor: true, window: 'cooldown-start', windowMs: 1000 });
  });

  it('Босс-задвижка: ХП 400, Броня 10, стационарен, телеграф 500 мс, AoE-урон 25 в радиусе 3 м, слабость ×3 игнорирует броню в первые 2000 мс отката', () => {
    const def = ENEMY_DEFS['enemy.boss_zadvizhka'];
    expect(def.role).toBe('boss');
    expect(def.hp).toBe(400);
    expect(def.armor).toBe(10);
    expect(def.moveSpeed).toBe(0);
    expect(def.attack.telegraphMs).toBe(500);
    expect(def.attack.damage).toBe(25);
    expect(def.attack.aoeRadiusM).toBe(3);
    expect(def.weakness).toEqual({ multiplier: 3, ignoresArmor: true, window: 'cooldown-start', windowMs: 2000 });
  });

  it('все 8 врагов несут xpLevel/danger (формула опыта §4 rpg-system.md)', () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      expect(def.xpLevel).toBeGreaterThan(0);
      expect(def.danger).toBeGreaterThanOrEqual(0);
    }
  });
});
