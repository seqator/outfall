/**
 * Сортировка по глубине для изометрии (§3.3). Это конкретно рендер-забота:
 * какой слой рисуется поверх какого — sim о слоях отрисовки ничего не знает.
 */

export type RenderLayer = 'ground' | 'decal' | 'object' | 'fx' | 'overhead';

const LAYER_BIAS: Record<RenderLayer, number> = {
  ground: 0,
  decal: 1,
  object: 2,
  fx: 3,
  overhead: 4,
};

/** Чем «ниже по экрану» объект, тем позже он рисуется. */
export function depthKey(wx: number, wy: number, z: number, layer: RenderLayer): number {
  return (wx + wy) * 1024 + z + LAYER_BIAS[layer];
}
