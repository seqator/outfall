/**
 * Изометрическая проекция (§3.3). Чистая математика без DOM/render — обе
 * стороны (симуляция для прицеливания и рендер для отрисовки) используют
 * один и тот же код, гарантируя, что «мышка целится туда же, куда попадает».
 */

/** Размер тайла в пикселях: ромб 2:1. */
export const TILE_W = 64;
export const TILE_H = 32;

export interface IsoProjection {
  toScreen(wx: number, wy: number, z?: number): { sx: number; sy: number };
  toWorld(sx: number, sy: number): { wx: number; wy: number };
}

export function createIsoProjection(tileW: number = TILE_W, tileH: number = TILE_H): IsoProjection {
  const halfW = tileW / 2;
  const halfH = tileH / 2;

  return {
    toScreen(wx: number, wy: number, z = 0): { sx: number; sy: number } {
      return {
        sx: (wx - wy) * halfW,
        sy: (wx + wy) * halfH - z,
      };
    },
    toWorld(sx: number, sy: number): { wx: number; wy: number } {
      return {
        wx: sx / (2 * halfW) + sy / (2 * halfH),
        wy: sy / (2 * halfH) - sx / (2 * halfW),
      };
    },
  };
}
