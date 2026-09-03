/** Камера сцены: позиция в мировых координатах + масштаб. Без DOM/pixi. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function createCamera(initial: Partial<Camera> = {}): Camera {
  return { x: 0, y: 0, zoom: 1, ...initial };
}
