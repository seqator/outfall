/**
 * `NullRenderer` — реализация `IRenderer` без побочных эффектов. Используется
 * в юнит/интеграционных тестах и в headless-реплеях (`sim` можно прогонять
 * без единого пикселя на экране).
 */

import { createIsoProjection, type IsoProjection } from '../core/iso';
import type { World } from '../core/world';
import type { Camera } from './camera';
import type {
  IRenderer,
  MapData,
  ParticleBurst,
  RendererInitOptions,
  RendererStats,
} from './renderer';
import { screenToWorldPoint, type WorldPoint } from './screen-to-world';

export class NullRenderer implements IRenderer {
  private drawCallsCount = 0;
  private readonly iso: IsoProjection = createIsoProjection();
  /** Размер «канваса» — из `init()` (симметрично `PixiRenderer.app.screen.width/height`), 0 до вызова `init()`. */
  private width = 0;
  private height = 0;

  init(_canvas: HTMLCanvasElement, opts: RendererInitOptions): Promise<void> {
    this.width = opts.width;
    this.height = opts.height;
    return Promise.resolve();
  }

  async loadAtlas(_id: string, _url: string): Promise<void> {
    // намеренно ничего не делает
  }

  unloadAtlas(_id: string): void {
    // намеренно ничего не делает
  }

  setMap(_map: MapData): void {
    // намеренно ничего не делает
  }

  draw(_world: World, _camera: Camera, _alpha: number): void {
    this.drawCallsCount += 1;
  }

  screenToWorld(sx: number, sy: number, camera: Camera): WorldPoint {
    return screenToWorldPoint(this.iso, camera, this.width, this.height, sx, sy);
  }

  emitParticles(_fx: ParticleBurst): void {
    // намеренно ничего не делает
  }

  resize(_w: number, _h: number): void {
    // намеренно ничего не делает
  }

  destroy(): void {
    this.drawCallsCount = 0;
  }

  stats(): RendererStats {
    return { drawCalls: this.drawCallsCount, sprites: 0, frameMs: 0 };
  }
}
