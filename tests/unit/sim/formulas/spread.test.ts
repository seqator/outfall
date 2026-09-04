import { describe, expect, it } from 'vitest';
import { computeSpreadDeg } from '../../../../src/sim/formulas/spread';

describe('sim/formulas/spread: computeSpreadDeg (§4.3)', () => {
  it('пистолет, Навык=50, стоя → 3,9°', () => {
    expect(computeSpreadDeg({ baseConeDeg: 6, skill: 50, moving: false })).toBeCloseTo(3.9, 2);
  });

  it('пистолет, Навык=50, на бегу (КоэфДвижения «Огрызка» 1,3) → 5,07°', () => {
    expect(computeSpreadDeg({ baseConeDeg: 6, skill: 50, moving: true, moveCoef: 1.3 })).toBeCloseTo(5.07, 2);
  });

  it('стандартный КоэфДвижения на бегу — 1,6, если не переопределён', () => {
    expect(computeSpreadDeg({ baseConeDeg: 6, skill: 50, moving: true })).toBeCloseTo(6 * 0.65 * 1.6, 6);
  });

  it('минимум конуса: КоэфНавык не ниже 0,4 даже при Навык=100', () => {
    const spread = computeSpreadDeg({ baseConeDeg: 6, skill: 100, moving: false });
    expect(spread).toBeCloseTo(6 * 0.4, 6);
  });

  it('Навык=0 даёт максимальный КоэфНавык=1 (без бонуса точности)', () => {
    expect(computeSpreadDeg({ baseConeDeg: 6, skill: 0, moving: false })).toBeCloseTo(6, 6);
  });
});
