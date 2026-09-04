import { describe, expect, it } from 'vitest';
import { WEAPON_DEFS, WEAPON_SLOT_ORDER } from '../../../../src/sim/formulas/weapons';

describe('sim/formulas/weapons: WEAPON_DEFS (combat.md §3, три оружия среза)', () => {
  it('«Огрызок»: урон 8, 250 мс/выстрел, магазин 8, перезарядка 1200 мс, конус 6°', () => {
    const def = WEAPON_DEFS['item.pistol_ogryzok'];
    expect(def.baseDamage).toBe(8);
    expect(def.fireCooldownMs).toBe(250);
    expect(def.magazineSize).toBe(8);
    expect(def.reloadMs).toBe(1200);
    expect(def.baseSpreadDeg).toBe(6);
    expect(def.moveSpreadCoef).toBe(1.3);
  });

  it('«Дупло»: урон 14, 1400 мс/выстрел, магазин 2, перезарядка 1800 мс, конус 18°, падение урона свыше 6 м', () => {
    const def = WEAPON_DEFS['item.shotgun_duplo'];
    expect(def.baseDamage).toBe(14);
    expect(def.fireCooldownMs).toBe(1400);
    expect(def.magazineSize).toBe(2);
    expect(def.reloadMs).toBe(1800);
    expect(def.baseSpreadDeg).toBe(18);
    expect(def.rangeFalloff).toEqual({ beyondM: 6, multiplier: 0.5 });
  });

  it('«Кран»: урон 18, 600 мс/удар, без патронов, ближний бой 1,2 м', () => {
    const def = WEAPON_DEFS['item.wrench_kran'];
    expect(def.baseDamage).toBe(18);
    expect(def.fireCooldownMs).toBe(600);
    expect(def.magazineSize).toBeUndefined();
    expect(def.meleeRangeM).toBe(1.2);
    expect(def.branch).toBe('fists');
  });

  it('WEAPON_SLOT_ORDER — три оружия среза в порядке slot1/2/3', () => {
    expect(WEAPON_SLOT_ORDER).toEqual([
      'item.pistol_ogryzok',
      'item.shotgun_duplo',
      'item.wrench_kran',
    ]);
  });
});
