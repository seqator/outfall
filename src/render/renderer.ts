/**
 * Граница «логика ↔ рендер» (§3.5). Это единственный интерфейс, через
 * который `game` управляет отрисовкой. Настоящая реализация — Pixi, живёт в
 * `src/render/pixi/**` (единственное место с `import 'pixi.js'`,
 * см. `eslint.config.js`). Для тестов и headless-сценариев — `NullRenderer`.
 */

import type { World } from '../core/world';
import type { Camera } from './camera';

/**
 * Плейсхолдер данных карты до появления `MapSchema` (задача OF-009).
 * Форма уточнится, когда схема будет готова — контракт `IRenderer.setMap`
 * от этого не изменится.
 */
export interface MapData {
  readonly id: string;
  readonly width: number;
  readonly height: number;
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
