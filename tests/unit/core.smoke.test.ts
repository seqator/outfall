import { describe, expect, it } from 'vitest';
import { TICK_DT, TICK_HZ, clamp, createIsoProjection, createSeededRng } from '../../src/core';

describe('core: smoke', () => {
  it('TICK_DT соответствует TICK_HZ', () => {
    expect(TICK_HZ).toBe(60);
    expect(TICK_DT).toBeCloseTo(1 / 60);
  });

  it('SeededRng: один и тот же seed даёт одну и ту же последовательность', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('IsoProjection: toWorld(toScreen(x, y)) — тождество', () => {
    const iso = createIsoProjection();
    const world = { wx: 3, wy: 5 };
    const screen = iso.toScreen(world.wx, world.wy);
    const back = iso.toWorld(screen.sx, screen.sy);
    expect(back.wx).toBeCloseTo(world.wx);
    expect(back.wy).toBeCloseTo(world.wy);
  });

  it('clamp ограничивает значение диапазоном', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
