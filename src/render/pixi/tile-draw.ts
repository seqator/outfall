/**
 * Отрисовка изометрических тайлов `Graphics`-примитивами (OF-015) — рисуем
 * пол и стены прямо по данным `layers.*` карты, без тайлсета: настоящий
 * атлас появится в OF-022. Раскраска фиксированными цветами палитры
 * (`tools/px/palette.json`), а не по индексу тайла — индексов пока всего
 * два смысла (пол/стена), сам тайлсет ещё не существует.
 *
 * Геометрия — четыре угла тайла (x,y)..(x+1,y+1), спроецированные через
 * `IsoProjection.toScreen`; так пол тайлится без щелей независимо от
 * `TILE_W`/`TILE_H`. Стены — простая изопрямоугольная «коробка» (верх + два
 * видимых борта), чтобы в скриншоте они читались как препятствия, а не
 * плоские плашки.
 */

import type { Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/iso';

interface ScreenPoint {
  sx: number;
  sy: number;
}

interface TileCorners {
  n: ScreenPoint;
  e: ScreenPoint;
  s: ScreenPoint;
  w: ScreenPoint;
}

function tileCorners(iso: IsoProjection, x: number, y: number, z: number): TileCorners {
  return {
    n: iso.toScreen(x, y, z),
    e: iso.toScreen(x + 1, y, z),
    s: iso.toScreen(x + 1, y + 1, z),
    w: iso.toScreen(x, y + 1, z),
  };
}

function poly(c: ScreenPoint[]): number[] {
  const flat: number[] = [];
  for (const p of c) {
    flat.push(p.sx, p.sy);
  }
  return flat;
}

/** Затемняет/осветляет цвет множителем — для граней «коробки» стены (свет сверху). */
export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

export function drawGroundTile(g: Graphics, iso: IsoProjection, x: number, y: number, color: number): void {
  const c = tileCorners(iso, x, y, 0);
  g.poly(poly([c.n, c.e, c.s, c.w])).fill(color);
}

/** Изометрическая «коробка» стены: верхняя грань + две видимые боковые. */
export function drawWallBox(
  g: Graphics,
  iso: IsoProjection,
  x: number,
  y: number,
  color: number,
  heightPx: number,
): void {
  const base = tileCorners(iso, x, y, 0);
  const top = tileCorners(iso, x, y, heightPx);

  // Левая (запад→юг) и правая (восток→юг) грани — единственные, видимые
  // при стандартном изометрическом ракурсе «сверху-спереди».
  g.poly(poly([base.w, base.s, top.s, top.w])).fill(shade(color, 0.7));
  g.poly(poly([base.e, base.s, top.s, top.e])).fill(shade(color, 0.85));
  g.poly(poly([top.n, top.e, top.s, top.w])).fill(shade(color, 1.15));
}
