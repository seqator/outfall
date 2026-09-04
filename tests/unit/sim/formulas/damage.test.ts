import { describe, expect, it } from 'vitest';
import { computeDamage, computeFistsDamage } from '../../../../src/sim/formulas/damage';

describe('sim/formulas/damage: computeDamage (§4.1)', () => {
  it('база=8, навык=50, крит=1, слабость=1, броня=2 → 6', () => {
    expect(computeDamage({ base: 8, skill: 50, crit: 1, weakness: 1, armor: 2 })).toBe(6);
  });

  it('пример GDD: «Огрызок» в раскрытую клешню рака → 10', () => {
    expect(computeDamage({ base: 8, skill: 50, crit: 1, weakness: 1.5, armor: 2 })).toBe(10);
  });

  it('минимум урона — не опускается ниже 1 даже при огромной броне', () => {
    expect(computeDamage({ base: 1, skill: 0, crit: 1, weakness: 1, armor: 99 })).toBe(1);
  });

  it('слабость, игнорирующая броню — член −Броня не применяется', () => {
    const withIgnore = computeDamage({ base: 20, skill: 50, crit: 1, weakness: 2.5, armor: 8, ignoresArmor: true });
    const withoutArmor = computeDamage({ base: 20, skill: 50, crit: 1, weakness: 2.5, armor: 0 });
    expect(withIgnore).toBe(withoutArmor);
  });

  it('крит ×2 удваивает итоговый урон при прочих равных (до вычета брони)', () => {
    const normal = computeDamage({ base: 10, skill: 50, crit: 1, weakness: 1, armor: 0 });
    const crit = computeDamage({ base: 10, skill: 50, crit: 2, weakness: 1, armor: 0 });
    expect(crit).toBe(normal * 2);
  });
});

describe('sim/formulas/damage: computeFistsDamage (§5.1)', () => {
  it('пример GDD: «Кран» против охраны (Броня=4) → вычитается ровно 2, итог 16', () => {
    expect(computeFistsDamage({ base: 18, skill: 50, crit: 1, weakness: 1, armor: 4 })).toBe(16);
  });

  it('минимум урона — не опускается ниже 1', () => {
    expect(computeFistsDamage({ base: 1, skill: 0, crit: 1, weakness: 1, armor: 99 })).toBe(1);
  });

  it('слабость, игнорирующая броню — броня не вычитается даже наполовину', () => {
    const withIgnore = computeFistsDamage({
      base: 20,
      skill: 50,
      crit: 1,
      weakness: 2,
      armor: 8,
      ignoresArmor: true,
    });
    const withoutArmor = computeFistsDamage({ base: 20, skill: 50, crit: 1, weakness: 2, armor: 0 });
    expect(withIgnore).toBe(withoutArmor);
  });
});
