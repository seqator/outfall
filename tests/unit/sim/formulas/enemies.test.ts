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
