import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../../../src/core/rng';
import { computeCritChance, rollCrit } from '../../../../src/sim/formulas/crit';

describe('sim/formulas/crit: computeCritChance (§4.2)', () => {
  it('Кураж=5 (стартовое значение) → 10,5%', () => {
    expect(computeCritChance(5)).toBeCloseTo(0.105, 6);
  });

  it('Кураж=10 → 18%', () => {
    expect(computeCritChance(10)).toBeCloseTo(0.18, 6);
  });
});

describe('sim/formulas/crit: rollCrit', () => {
  it('100 000 симуляций roll < ШансКрита — доля крита в диапазоне 10,5% ± 0,3% для Кураж=5', () => {
    const rng = createSeededRng(42);
    let crits = 0;
    const trials = 100_000;
    for (let i = 0; i < trials; i += 1) {
      if (rollCrit(rng, 5) === 2) crits += 1;
    }
    const ratio = crits / trials;
    expect(ratio).toBeGreaterThan(0.102);
    expect(ratio).toBeLessThan(0.108);
  });

  it('возвращает ровно 1 или 2, никогда другое значение', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i += 1) {
      expect([1, 2]).toContain(rollCrit(rng, 5));
    }
  });
});
