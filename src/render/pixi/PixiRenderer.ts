/**
 * Единственный файл каркаса, где `pixi.js` реально импортируется вне этой
 * папки (правило проекта, см. `eslint.config.js`). Реализует `IRenderer`:
 * `game`/тесты работают только через этот интерфейс, никогда — через Pixi
 * напрямую.
 *
 * OF-015: `setMap`/`draw` рисуют изометрическую карту и героя-болванчика
 * `Graphics`-примитивами палитры `tools/px/palette.json` — настоящих
 * спрайтов ещё нет (OF-020/OF-022), это не в скоупе.
 *
 * OF-016: `draw()` дополнительно рисует врагов (`enemy`/`aiState`/`health`
 * компоненты — те же строковые ключи `Components`, что и `sim`, без
 * прямого импорта `sim`: граница слоёв, §1 архитектуры, запрещает
 * `render` импортировать `sim`, поэтому цвет по роли врага определяется по
 * `enemy.defId`, известному здесь как литеральная строка, не тип из
 * `sim/formulas/enemies.ts`) и снаряды (`projectile`), плюс простой пул
 * `Graphics` для частиц (`emitParticles`) — переиспользуемые объекты, без
 * аллокации новых `Graphics` в горячем цикле кадра (§5 задачи).
 */

import { Application, Container, Graphics, Ticker, TextureSource } from 'pixi.js';
import { createIsoProjection, type IsoProjection } from '../../core/iso';
import { clamp, lerp } from '../../core/math';
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

/** Цвет врага по роли (см. допущение в шапке файла — по `enemy.defId`, не по импорту `sim`). */
const ENEMY_FILL_RUSHER = 0xc0392b; // Раки
const ENEMY_FILL_CONTROLLER = 0x8e44ad; // Подлинейный
const ENEMY_FILL_SHOOTER = 0x2d6ca6; // Охрана «Прогресс-2»
const ENEMY_FILL_DEFAULT = 0x666666; // враг вне среза/неизвестный defId — не должно случаться в OF-016
const ENEMY_OUTLINE = 0xf4f1e8;
const ENEMY_RADIUS_PX = 11;
/** Тонировка круга врага в фазе `telegraph` — «читаемый» сигнал атаки (§1 combat.md). */
const ENEMY_TELEGRAPH_TINT = 0xffe066;
const ENEMY_NORMAL_TINT = 0xffffff;

const HP_BAR_WIDTH_PX = 24;
const HP_BAR_HEIGHT_PX = 3;
const HP_BAR_OFFSET_PX = ENEMY_RADIUS_PX + 8;
const HP_BAR_BG_COLOR = 0x241f1a;
const HP_BAR_FG_COLOR = 0x7cfc00;

const PROJECTILE_COLOR = 0xf4f1e8;
const PROJECTILE_RADIUS_PX = 3;

const PARTICLE_RADIUS_PX = 3;
const PARTICLE_LIFETIME_MS = 400;
const PARTICLE_POOL_MAX = 2048;
const PARTICLE_HIT_COLOR = 0xffe066;
const PARTICLE_DEATH_COLOR = 0xc0392b;
const PARTICLE_SPEED_PX_PER_MS = 0.06;

function colorForEnemyDefId(defId: string): number {
  switch (defId) {
    case 'enemy.raki':
      return ENEMY_FILL_RUSHER;
    case 'enemy.podlineiny':
      return ENEMY_FILL_CONTROLLER;
    case 'enemy.ohrana_progress2':
      return ENEMY_FILL_SHOOTER;
    default:
      return ENEMY_FILL_DEFAULT;
  }
}

interface EnemyVisual {
  readonly root: Container;
  readonly body: Graphics;
  readonly hpFill: Graphics;
}

interface PooledParticle {
  readonly gfx: Graphics;
  active: boolean;
  lifeMs: number;
  vx: number;
  vy: number;
}

export class PixiRenderer implements IRenderer {
  private app: Application | null = null;
  private frameCallbacks = new Set<(deltaMs: number) => void>();
  private lastFrameMs = 0;

  private readonly iso: IsoProjection = createIsoProjection();
  /** Корень мировой сцены: сдвигается/масштабируется камерой целиком (setMap строит содержимое один раз, draw() двигает только этот контейнер + героя). */
  private worldRoot: Container | null = null;
  /** Стены + динамические сущности (герой/враги/снаряды) — сортируются по `zIndex = depthKey(...)`. */
  private objectsLayer: Container | null = null;
  /** Частицы — отдельный слой поверх objectsLayer, не участвует в сортировке по глубине (эффекты всегда сверху). */
  private particlesLayer: Container | null = null;
  private mapData: MapData | null = null;

  /** Пулы `Graphics`/составных визуалов по `EntityId` — не создаём/не удаляем на каждый кадр (§5 задачи). */
  private readonly heroGraphicsByEntity = new Map<EntityId, Graphics>();
  private readonly enemyVisualsByEntity = new Map<EntityId, EnemyVisual>();
  private readonly projectileGraphicsByEntity = new Map<EntityId, Graphics>();
  /** Переиспользуемый scratch-набор для вычисления «пропавших» сущностей в draw() — без аллокации на кадр. */
  private readonly seenScratch = new Set<EntityId>();

  /** Все когда-либо созданные частицы — только для обхода в `advanceParticles` (не для поиска свободных, см. `freeParticles`). */
  private readonly particlePool: PooledParticle[] = [];
  /**
   * Свободные (неактивные) частицы — стек: O(1) `pop`/`push` вместо
   * линейного поиска по `particlePool` при каждом `emitParticles` (важно на
   * стресс-тесте — 2000 частиц одним вызовом, §8 задачи).
   */
  private readonly freeParticles: PooledParticle[] = [];

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
    this.advanceParticles(ticker.deltaMS);
    for (const cb of this.frameCallbacks) cb(ticker.deltaMS);
  };

  /** Двигает/угашает активные частицы пула — реальное время кадра, не тик симуляции (чисто визуальный эффект, не боевая логика). */
  private advanceParticles(deltaMs: number): void {
    for (const particle of this.particlePool) {
      if (!particle.active) continue;
      particle.lifeMs -= deltaMs;
      if (particle.lifeMs <= 0) {
        particle.active = false;
        particle.gfx.visible = false;
        this.freeParticles.push(particle);
        continue;
      }
      particle.gfx.position.x += particle.vx * deltaMs;
      particle.gfx.position.y += particle.vy * deltaMs;
      particle.gfx.alpha = clamp(particle.lifeMs / PARTICLE_LIFETIME_MS, 0, 1);
    }
  }

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
    this.enemyVisualsByEntity.clear();
    this.projectileGraphicsByEntity.clear();
    this.particlePool.length = 0;
    this.freeParticles.length = 0;

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

    const particles = new Container();
    this.worldRoot.addChild(particles);
    this.particlesLayer = particles;
  }

  private drawHero(world: World, alpha: number, seen: Set<EntityId>): void {
    if (!this.objectsLayer) return;

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
  }

  private createEnemyVisual(defId: string): EnemyVisual {
    const root = new Container();

    const body = new Graphics()
      .circle(0, 0, ENEMY_RADIUS_PX)
      .fill(colorForEnemyDefId(defId))
      .stroke({ width: 2, color: ENEMY_OUTLINE });
    root.addChild(body);

    const hpBg = new Graphics()
      .rect(-HP_BAR_WIDTH_PX / 2, -HP_BAR_OFFSET_PX, HP_BAR_WIDTH_PX, HP_BAR_HEIGHT_PX)
      .fill(HP_BAR_BG_COLOR);
    root.addChild(hpBg);

    // Полоска ХП — отдельный `Graphics` фиксированной геометрии; заполнение
    // меняется через `scale.x` (дёшево — без перестроения геометрии каждый
    // кадр, важно при 300 врагах на стресс-тесте, §5 задачи).
    const hpFill = new Graphics()
      .rect(0, 0, HP_BAR_WIDTH_PX, HP_BAR_HEIGHT_PX)
      .fill(HP_BAR_FG_COLOR);
    hpFill.position.set(-HP_BAR_WIDTH_PX / 2, -HP_BAR_OFFSET_PX);
    root.addChild(hpFill);

    return { root, body, hpFill };
  }

  private drawEnemies(world: World, alpha: number, seen: Set<EntityId>): void {
    if (!this.objectsLayer) return;

    for (const entity of world.query('enemy', 'transform', 'health', 'aiState')) {
      const transform = world.store('transform').get(entity);
      const health = world.store('health').get(entity);
      const enemy = world.store('enemy').get(entity);
      const aiState = world.store('aiState').get(entity);
      /* v8 ignore next */
      if (!transform || !health || !enemy || !aiState) continue;
      seen.add(entity);

      let visual = this.enemyVisualsByEntity.get(entity);
      if (!visual) {
        visual = this.createEnemyVisual(enemy.defId);
        this.objectsLayer.addChild(visual.root);
        this.enemyVisualsByEntity.set(entity, visual);
      }

      const ix = lerp(transform.prevX, transform.x, alpha);
      const iy = lerp(transform.prevY, transform.y, alpha);
      const screen = this.iso.toScreen(ix, iy, transform.z);
      visual.root.position.set(screen.sx, screen.sy - ENEMY_RADIUS_PX);
      visual.root.zIndex = depthKey(ix, iy, transform.z, 'object');
      visual.body.tint = aiState.phase === 'telegraph' ? ENEMY_TELEGRAPH_TINT : ENEMY_NORMAL_TINT;
      visual.hpFill.scale.x = clamp(health.hp / health.maxHp, 0, 1);
    }

    for (const [entity, visual] of this.enemyVisualsByEntity) {
      if (seen.has(entity)) continue;
      this.objectsLayer.removeChild(visual.root);
      visual.root.destroy({ children: true });
      this.enemyVisualsByEntity.delete(entity);
    }
  }

  private drawProjectiles(world: World, alpha: number, seen: Set<EntityId>): void {
    if (!this.objectsLayer) return;

    for (const entity of world.query('projectile', 'transform')) {
      const transform = world.store('transform').get(entity);
      /* v8 ignore next */
      if (!transform) continue;
      seen.add(entity);

      let gfx = this.projectileGraphicsByEntity.get(entity);
      if (!gfx) {
        gfx = new Graphics().circle(0, 0, PROJECTILE_RADIUS_PX).fill(PROJECTILE_COLOR);
        this.objectsLayer.addChild(gfx);
        this.projectileGraphicsByEntity.set(entity, gfx);
      }

      const ix = lerp(transform.prevX, transform.x, alpha);
      const iy = lerp(transform.prevY, transform.y, alpha);
      const screen = this.iso.toScreen(ix, iy, transform.z);
      gfx.position.set(screen.sx, screen.sy);
      gfx.zIndex = depthKey(ix, iy, transform.z, 'fx');
    }

    for (const [entity, gfx] of this.projectileGraphicsByEntity) {
      if (seen.has(entity)) continue;
      this.objectsLayer.removeChild(gfx);
      gfx.destroy();
      this.projectileGraphicsByEntity.delete(entity);
    }
  }

  /**
   * Читает компоненты героя/врагов/снарядов и обновляет пулы спрайтов;
   * двигает камеру всей сценой разом (дёшево — не пересчитывает позицию
   * каждого тайла). `alpha` — интерполяция `prevX/prevY → x/y` (§3.1
   * архитектуры).
   */
  draw(world: World, camera: Camera, alpha: number): void {
    if (!this.app || !this.worldRoot || !this.objectsLayer) return;

    const seen = this.seenScratch;
    seen.clear();
    this.drawHero(world, alpha, seen);
    // `seen` совместно используется героем/врагами/снарядами — у них разные
    // пулы (`heroGraphicsByEntity`/`enemyVisualsByEntity`/
    // `projectileGraphicsByEntity`), поэтому пересечение id между категориями
    // невозможно (ECS-сущность имеет только один набор компонентов), но
    // очищать `seen` между вызовами не нужно — каждый `drawX` ищет своих
    // «пропавших» только в своей `Map`.
    seen.clear();
    this.drawEnemies(world, alpha, seen);
    seen.clear();
    this.drawProjectiles(world, alpha, seen);

    const camScreen = this.iso.toScreen(camera.x, camera.y);
    this.worldRoot.scale.set(camera.zoom);
    this.worldRoot.position.set(
      this.app.screen.width / 2 - camScreen.sx * camera.zoom,
      this.app.screen.height / 2 - camScreen.sy * camera.zoom,
    );
  }

  private colorForParticleKind(kind: string): number {
    return kind === 'death' ? PARTICLE_DEATH_COLOR : PARTICLE_HIT_COLOR;
  }

  /**
   * Вспышка попадания/смерти — простой пул `Graphics` (§5 задачи: без
   * аллокации новых объектов в горячем цикле). Переиспользует неактивные
   * частицы пула; при исчерпании `PARTICLE_POOL_MAX` создаёт новые до
   * потолка, дальше молча игнорирует лишние (стресс-тест намеренно просит
   * 2000 частиц разом — потолок пула не даёт разрастись неограниченно).
   */
  emitParticles(fx: ParticleBurst): void {
    if (!this.particlesLayer) return;
    const screen = this.iso.toScreen(fx.wx, fx.wy);
    const color = this.colorForParticleKind(fx.kind);

    for (let i = 0; i < fx.count; i += 1) {
      let particle = this.freeParticles.pop();
      if (!particle) {
        if (this.particlePool.length >= PARTICLE_POOL_MAX) break;
        const gfx = new Graphics().circle(0, 0, PARTICLE_RADIUS_PX).fill(color);
        gfx.visible = false;
        this.particlesLayer.addChild(gfx);
        particle = { gfx, active: false, lifeMs: 0, vx: 0, vy: 0 };
        this.particlePool.push(particle);
      }

      const angle = Math.random() * Math.PI * 2;
      particle.gfx.clear().circle(0, 0, PARTICLE_RADIUS_PX).fill(color);
      particle.gfx.position.set(screen.sx, screen.sy);
      particle.gfx.visible = true;
      particle.gfx.alpha = 1;
      particle.vx = Math.cos(angle) * PARTICLE_SPEED_PX_PER_MS;
      particle.vy = Math.sin(angle) * PARTICLE_SPEED_PX_PER_MS;
      particle.lifeMs = PARTICLE_LIFETIME_MS;
      particle.active = true;
    }
  }

  resize(w: number, h: number): void {
    this.app?.renderer.resize(w, h);
  }

  destroy(): void {
    this.frameCallbacks.clear();
    this.heroGraphicsByEntity.clear();
    this.enemyVisualsByEntity.clear();
    this.projectileGraphicsByEntity.clear();
    this.particlePool.length = 0;
    this.freeParticles.length = 0;
    this.seenScratch.clear();
    this.app?.ticker.remove(this.handleTick);
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.worldRoot = null;
    this.objectsLayer = null;
    this.particlesLayer = null;
    this.mapData = null;
  }

  /** Реальные drawCalls появятся вместе с полноценным атласом (OF-027); здесь — оценка через число видимых объектов. */
  stats(): RendererStats {
    return {
      drawCalls: 0,
      sprites: this.app?.stage.children.length ?? 0,
      frameMs: this.lastFrameMs,
    };
  }
}
