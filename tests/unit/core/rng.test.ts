import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../../src/core/rng';

describe('core/rng: createSeededRng', () => {
  it('хранит переданный seed', () => {
    expect(createSeededRng(42).seed).toBe(42);
  });

  it('int(min, max) всегда попадает в диапазон включительно с обеих сторон', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 500; i += 1) {
      const v = rng.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('int(n, n) с равными границами всегда даёт n', () => {
    const rng = createSeededRng(9);
    for (let i = 0; i < 20; i += 1) {
      expect(rng.int(7, 7)).toBe(7);
    }
  });

  it('range(min, max) всегда в [min, max)', () => {
    const rng = createSeededRng(456);
    for (let i = 0; i < 500; i += 1) {
      const v = rng.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('одинаковый seed даёт одинаковую последовательность int()/range()', () => {
    const a = createSeededRng(77);
    const b = createSeededRng(77);

    const intsA = Array.from({ length: 5 }, () => a.int(0, 1000));
    const intsB = Array.from({ length: 5 }, () => b.int(0, 1000));
    expect(intsA).toEqual(intsB);

    const rangesA = Array.from({ length: 5 }, () => a.range(-1, 1));
    const rangesB = Array.from({ length: 5 }, () => b.range(-1, 1));
    expect(rangesA).toEqual(rangesB);
  });

  it('разные seed почти наверняка дают разные последовательности', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
});
