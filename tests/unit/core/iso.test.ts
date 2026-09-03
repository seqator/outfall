import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, createIsoProjection } from '../../../src/core/iso';

describe('core/iso: createIsoProjection', () => {
  it('toScreen(0,0) — начало координат совпадает', () => {
    const iso = createIsoProjection();
    expect(iso.toScreen(0, 0)).toEqual({ sx: 0, sy: 0 });
  });

  it('toScreen: z по умолчанию 0 — не сдвигает sy', () => {
    const iso = createIsoProjection();
    const withDefaultZ = iso.toScreen(2, 3);
    const withExplicitZeroZ = iso.toScreen(2, 3, 0);
    expect(withDefaultZ).toEqual(withExplicitZeroZ);
  });

  it('toScreen: положительный z поднимает точку на экране (уменьшает sy)', () => {
    const iso = createIsoProjection();
    const ground = iso.toScreen(2, 3, 0);
    const lifted = iso.toScreen(2, 3, 10);
    expect(lifted.sy).toBe(ground.sy - 10);
    expect(lifted.sx).toBe(ground.sx);
  });

  it('toWorld(toScreen(x, y)) — тождество для набора точек', () => {
    const iso = createIsoProjection();
    const points = [
      { wx: 0, wy: 0 },
      { wx: 3, wy: 5 },
      { wx: -4, wy: 2.5 },
      { wx: 10, wy: -10 },
    ];
    for (const world of points) {
      const screen = iso.toScreen(world.wx, world.wy);
      const back = iso.toWorld(screen.sx, screen.sy);
      expect(back.wx).toBeCloseTo(world.wx);
      expect(back.wy).toBeCloseTo(world.wy);
    }
  });

  it('с явным размером тайла даёт другую проекцию, но остаётся обратимой', () => {
    const iso = createIsoProjection(32, 16);
    const screen = iso.toScreen(4, 1);
    expect(screen).toEqual({ sx: (4 - 1) * 16, sy: (4 + 1) * 8 });
    const back = iso.toWorld(screen.sx, screen.sy);
    expect(back.wx).toBeCloseTo(4);
    expect(back.wy).toBeCloseTo(1);
  });

  it('константы тайла соответствуют ромбу 2:1', () => {
    expect(TILE_W).toBe(64);
    expect(TILE_H).toBe(32);
    expect(TILE_W).toBe(TILE_H * 2);
  });
});
