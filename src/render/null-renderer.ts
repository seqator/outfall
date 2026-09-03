/**
 * `NullRenderer` — реализация `IRenderer` без побочных эффектов. Используется
 * в юнит/интеграционных тестах и в headless-реплеях (`sim` можно прогонять
 * без единого пикселя на экране).
 */

import type { World } from '../core/world';
import type { Camera } from './camera';
import type {
  IRenderer,
  MapData,
  ParticleBurst,
  RendererInitOptions,
  RendererStats,
} from './renderer';

export class NullRenderer implements IRenderer {
  private drawCallsCount = 0;

  async init(_canvas: HTMLCanvasElement, _opts: RendererInitOptions): Promise<void> {
    // намеренно ничего не делает
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
