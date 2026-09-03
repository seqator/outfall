import { describe, expect, it } from 'vitest';
import { approxEqual, clamp, lerp } from '../../../src/core/math';

describe('core/math', () => {
  it('clamp: значение внутри диапазона не меняется', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamp: значение ниже диапазона обрезается до минимума', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamp: значение выше диапазона обрезается до максимума', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp: alpha=0 даёт from, alpha=1 даёт to', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('lerp: alpha=0.5 даёт середину', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('lerp: работает с отрицательными значениями', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it('approxEqual: равные значения — true', () => {
    expect(approxEqual(1, 1)).toBe(true);
  });

  it('approxEqual: разница в пределах эпсилон по умолчанию — true', () => {
    expect(approxEqual(1, 1 + 1e-9)).toBe(true);
  });

  it('approxEqual: разница больше эпсилон по умолчанию — false', () => {
    expect(approxEqual(1, 1.1)).toBe(false);
  });

  it('approxEqual: явный эпсилон переопределяет порог', () => {
    expect(approxEqual(1, 1.05, 0.1)).toBe(true);
    expect(approxEqual(1, 1.2, 0.1)).toBe(false);
  });
});
