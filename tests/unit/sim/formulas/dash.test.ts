import { describe, expect, it } from 'vitest';
import { computeIframesMs, DASH_COOLDOWN_MS } from '../../../../src/sim/formulas/dash';

describe('sim/formulas/dash: computeIframesMs (§4.4)', () => {
  it('Острота=1 → 128 мс', () => {
    expect(computeIframesMs(1)).toBe(128);
  });

  it('Острота=10 → 200 мс (потолок диапазона)', () => {
    expect(computeIframesMs(10)).toBe(200);
  });

  it('никогда не опускается ниже 120 мс даже при Острота=0', () => {
    expect(computeIframesMs(0)).toBe(120);
  });

  it('никогда не превышает 200 мс даже при экстремальной Острота', () => {
    expect(computeIframesMs(999)).toBe(200);
  });
});

describe('sim/formulas/dash: DASH_COOLDOWN_MS', () => {
  it('фиксирован на 0,8 с (800 мс) — не зависит от статов', () => {
    expect(DASH_COOLDOWN_MS).toBe(800);
  });
});
