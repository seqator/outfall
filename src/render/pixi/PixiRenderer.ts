/**
 * Единственный файл каркаса, где `pixi.js` реально импортируется вне этой
 * папки (правило проекта, см. `eslint.config.js`). Реализует `IRenderer`:
 * `game`/тесты работают только через этот интерфейс, никогда — через Pixi
 * напрямую.
 *
 * Каркас OF-005 не грузит атласы/карты (нечего рисовать — контента ещё нет),
 * но контракт уже полный: `loadAtlas`/`setMap`/`draw`/`emitParticles`
 * реализуются по мере появления соответствующих задач (OF-015/016/027) без
 * изменения интерфейса.
 */

import { Application, Ticker, TextureSource } from 'pixi.js';
import type { World } from '../../core/world';
import type { Camera } from '../camera';
import type {
  IRenderer,
  MapData,
  ParticleBurst,
  RendererInitOptions,
  RendererStats,
} from '../renderer';

/** Форсируем WebGL: WebGPU-путь — риск #5 из доклада, включаем позже осознанно. */
const RENDERER_PREFERENCE = 'webgl' as const;

export class PixiRenderer implements IRenderer {
  private app: Application | null = null;
  private frameCallbacks = new Set<(deltaMs: number) => void>();
  private lastFrameMs = 0;

  async init(canvas: HTMLCanvasElement, opts: RendererInitOptions): Promise<void> {
    const app = new Application();
    await app.init({
      canvas,
      width: opts.width,
      height: opts.height,
      backgroundColor: 0x0a0a0a,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: RENDERER_PREFERENCE,
    });

    // Пиксель-арт: чёткие пиксели без сглаживания при масштабировании.
    TextureSource.defaultOptions.scaleMode = opts.pixelArt ? 'nearest' : 'linear';

    app.ticker.add(this.handleTick);
    this.app = app;
  }

  private handleTick = (ticker: Ticker): void => {
    this.lastFrameMs = ticker.deltaMS;
    for (const cb of this.frameCallbacks) cb(ticker.deltaMS);
  };

  /**
   * Подписка на кадры Pixi-тикера. Не часть `IRenderer` — используется
   * каркасной demo-сценой (OF-005) для FPS-оверлея, до появления
   * полноценного `GameLoop` (OF-010), который будет вызывать `draw()` сам.
   */
  onFrame(cb: (deltaMs: number) => void): () => void {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  loadAtlas(_id: string, _url: string): Promise<void> {
    throw new Error('PixiRenderer.loadAtlas: реализация — задача OF-015/OF-027');
  }

  unloadAtlas(_id: string): void {
    throw new Error('PixiRenderer.unloadAtlas: реализация — задача OF-015/OF-027');
  }

  setMap(_map: MapData): void {
    throw new Error('PixiRenderer.setMap: реализация — задача OF-015');
  }

  draw(_world: World, _camera: Camera, _alpha: number): void {
    throw new Error('PixiRenderer.draw: реализация — задача OF-015/OF-016');
  }

  emitParticles(_fx: ParticleBurst): void {
    throw new Error('PixiRenderer.emitParticles: реализация — задача OF-016');
  }

  resize(w: number, h: number): void {
    this.app?.renderer.resize(w, h);
  }

  destroy(): void {
    this.frameCallbacks.clear();
    this.app?.ticker.remove(this.handleTick);
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  /** Реальные drawCalls появятся вместе с пулом спрайтов (OF-015/016). */
  stats(): RendererStats {
    return {
      drawCalls: 0,
      sprites: this.app?.stage.children.length ?? 0,
      frameMs: this.lastFrameMs,
    };
  }
}
