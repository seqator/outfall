/**
 * Граница «логика ↔ рендер» (§3.5). Это единственный интерфейс, через
 * который `game` управляет отрисовкой. Настоящая реализация — Pixi, живёт в
 * `src/render/pixi/**` (единственное место с `import 'pixi.js'`,
 * см. `eslint.config.js`). Для тестов и headless-сценариев — `NullRenderer`.
 */

import type { World } from '../core/world';
import type { Camera } from './camera';

/**
 * Данные карты для статической отрисовки тайлов (OF-015, `MapSchema` из
 * `src/data/schemas/map.ts`, задача OF-009). `render` не импортирует
 * `data/schemas` напрямую (граница слоёв, §1 архитектуры) — `game` строит
 * `MapData` из `GameMap` (см. `src/game/world/map-loader.ts`) и передаёт
 * сюда только то, что нужно для отрисовки: без ссылок на контент (NPC,
 * враги, предметы — это забота `game`/будущих систем, не рендера).
 */
export interface MapData {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly layers: {
    /** Индексы тайлов пола, row-major, длина width×height. Тайлсет ещё не готов (OF-022) — рендер красит по индексу. */
    readonly ground: readonly number[];
    /** Индексы тайлов стен, row-major; 0 — нет стены. */
    readonly walls: readonly number[];
    /** 0 — проходимо, 1 — стена. Тот же формат, что `MapGridComponent` в `sim` — источник истины для рендера то же самое поле, что даёт `collisionSystem`. */
    readonly collision: readonly (0 | 1)[];
  };
}

/** Плейсхолдер визуального эффекта до появления полноценной fx-системы (OF-016). */
export interface ParticleBurst {
  readonly kind: string;
  readonly wx: number;
  readonly wy: number;
  readonly count: number;
}

export interface RendererStats {
  drawCalls: number;
  sprites: number;
  frameMs: number;
}

export interface RendererInitOptions {
  width: number;
  height: number;
  pixelArt: true;
}

export interface IRenderer {
  init(canvas: HTMLCanvasElement, opts: RendererInitOptions): Promise<void>;
  loadAtlas(id: string, url: string): Promise<void>;
  unloadAtlas(id: string): void;
  setMap(map: MapData): void;
  /** Читает компоненты и обновляет пул спрайтов. alpha — интерполяция transform.prev→cur. */
  draw(world: World, camera: Camera, alpha: number): void;
  emitParticles(fx: ParticleBurst): void;
  resize(w: number, h: number): void;
  destroy(): void;
  stats(): RendererStats;
}
