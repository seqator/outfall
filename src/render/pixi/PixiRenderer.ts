/**
 * Единственный файл каркаса, где `pixi.js` реально импортируется вне этой
 * папки (правило проекта, см. `eslint.config.js`). Реализует `IRenderer`:
 * `game`/тесты работают только через этот интерфейс, никогда — через Pixi
 * напрямую.
 *
 * OF-015: `setMap`/`draw` рисуют изометрическую карту и героя-болванчика
 * `Graphics`-примитивами палитры `tools/px/palette.json` — настоящих
 * спрайтов ещё нет (OF-020/OF-022), это не в скоупе. `loadAtlas`/
 * `emitParticles` остаются заглушками: атласов и частиц пока нечем
 * наполнить (OF-016/OF-027).
 */

import { Application, Container, Graphics, Ticker, TextureSource } from 'pixi.js';
import { createIsoProjection, type IsoProjection } from '../../core/iso';
import { lerp } from '../../core/math';
import type { EntityId, World } from '../../core/world';
import type { Camera } from '../camera';
import { depthKey } from '../depth';
import type {
  IRenderer,
  MapData,
  ParticleBurst,
  RendererInitOptions,
  RendererStats,
} from '../renderer';
import { drawGroundTile, drawWallBox } from './tile-draw';

/** Форсируем WebGL: WebGPU-путь — риск #5 из доклада, включаем позже осознанно. */
const RENDERER_PREFERENCE = 'webgl' as const;

/** Цвета — из `tools/px/palette.json` (единственный источник цвета в проекте). */
const GROUND_COLOR = 0x3a342c; // wet-asphalt
const WALL_COLOR = 0x7a3f22; // rust
const HERO_FILL = 0xffb13d; // terminal-amber
const HERO_OUTLINE = 0xf4f1e8; // flash-white

const WALL_HEIGHT_PX = 48;
const HERO_RADIUS_PX = 12;

export class PixiRenderer implements IRenderer {
  private app: Application | null = null;
  private frameCallbacks = new Set<(deltaMs: number) => void>();
  private lastFrameMs = 0;

  private readonly iso: IsoProjection = createIsoProjection();
  /** Корень мировой сцены: сдвигается/масштабируется камерой целиком (setMap строит содержимое один раз, draw() двигает только этот контейнер + героя). */
  private worldRoot: Container | null = null;
  /** Стены + динамические сущности (герой) — сортируются по `zIndex = depthKey(...)`. */
  private objectsLayer: Container | null = null;
  private mapData: MapData | null = null;

  /** Пул `Graphics` для отрисовки болванчиков по `EntityId` — не создаём/не удаляем на каждый кадр (§5 задачи). */
  private readonly heroGraphicsByEntity = new Map<EntityId, Graphics>();
  /** Переиспользуемый scratch-набор для вычисления «пропавших» сущностей в draw() — без аллокации на кадр. */
  private readonly seenScratch = new Set<EntityId>();

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

    const worldRoot = new Container();
    app.stage.addChild(worldRoot);
    this.worldRoot = worldRoot;
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
    throw new Error('PixiRenderer.loadAtlas: реализация — задача OF-027 (спрайтов ещё нет)');
  }

  unloadAtlas(_id: string): void {
    throw new Error('PixiRenderer.unloadAtlas: реализация — задача OF-027 (спрайтов ещё нет)');
  }

  setMap(map: MapData): void {
    if (!this.worldRoot) {
      throw new Error('PixiRenderer.setMap: init() ещё не вызван');
    }
    this.mapData = map;

    // Предыдущая карта (если была) — уничтожаем содержимое, не сам worldRoot.
    for (const child of [...this.worldRoot.children]) {
      this.worldRoot.removeChild(child);
      child.destroy({ children: true });
    }
    this.heroGraphicsByEntity.clear();

    const ground = new Graphics();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        drawGroundTile(ground, this.iso, x, y, GROUND_COLOR);
      }
    }
    this.worldRoot.addChild(ground);

    const objects = new Container();
    objects.sortableChildren = true;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        if (map.layers.collision[i] !== 1) continue;
        const wall = new Graphics();
        drawWallBox(wall, this.iso, x, y, WALL_COLOR, WALL_HEIGHT_PX);
        wall.zIndex = depthKey(x + 0.5, y + 0.5, 0, 'object');
        objects.addChild(wall);
      }
    }
    this.worldRoot.addChild(objects);
    this.objectsLayer = objects;
  }

  /**
   * Читает `transform` управляемых сущностей (герой-болванчик — единственный
   * такой сейчас, ИИ-враги OF-016 не будут иметь `controlled`) и обновляет
   * пул спрайтов; двигает камеру всей сценой разом (дёшево — не пересчитывает
   * позицию каждого тайла). `alpha` — интерполяция `prevX/prevY → x/y`
   * (§3.1 архитектуры).
   */
  draw(world: World, camera: Camera, alpha: number): void {
    if (!this.app || !this.worldRoot || !this.objectsLayer) return;

    const seen = this.seenScratch;
    seen.clear();

    for (const entity of world.query('transform', 'controlled')) {
      const transform = world.store('transform').get(entity);
      // query() уже гарантирует наличие transform — защита инварианта ECS.
      /* v8 ignore next */
      if (!transform) continue;
      seen.add(entity);

      let gfx = this.heroGraphicsByEntity.get(entity);
      if (!gfx) {
        gfx = new Graphics()
          .circle(0, 0, HERO_RADIUS_PX)
          .fill(HERO_FILL)
          .stroke({ width: 2, color: HERO_OUTLINE });
        this.objectsLayer.addChild(gfx);
        this.heroGraphicsByEntity.set(entity, gfx);
      }

      const ix = lerp(transform.prevX, transform.x, alpha);
      const iy = lerp(transform.prevY, transform.y, alpha);
      const screen = this.iso.toScreen(ix, iy, transform.z);
      // Приподнимаем над плоскостью тайла, чтобы кружок «стоял» на полу, а не утопал в его центре.
      gfx.position.set(screen.sx, screen.sy - HERO_RADIUS_PX);
      gfx.zIndex = depthKey(ix, iy, transform.z, 'object');
    }

    for (const [entity, gfx] of this.heroGraphicsByEntity) {
      if (seen.has(entity)) continue;
      this.objectsLayer.removeChild(gfx);
      gfx.destroy();
      this.heroGraphicsByEntity.delete(entity);
    }

    const camScreen = this.iso.toScreen(camera.x, camera.y);
    this.worldRoot.scale.set(camera.zoom);
    this.worldRoot.position.set(
      this.app.screen.width / 2 - camScreen.sx * camera.zoom,
      this.app.screen.height / 2 - camScreen.sy * camera.zoom,
    );
  }

  emitParticles(_fx: ParticleBurst): void {
    throw new Error('PixiRenderer.emitParticles: реализация — задача OF-016');
  }

  resize(w: number, h: number): void {
    this.app?.renderer.resize(w, h);
  }

  destroy(): void {
    this.frameCallbacks.clear();
    this.heroGraphicsByEntity.clear();
    this.seenScratch.clear();
    this.app?.ticker.remove(this.handleTick);
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.worldRoot = null;
    this.objectsLayer = null;
    this.mapData = null;
  }

  /** Реальные drawCalls появятся вместе с пулом спрайтов (OF-016 — враги/частицы). */
  stats(): RendererStats {
    return {
      drawCalls: 0,
      sprites: this.app?.stage.children.length ?? 0,
      frameMs: this.lastFrameMs,
    };
  }
}
