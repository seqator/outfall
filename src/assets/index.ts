/**
 * Слой `assets`: манифест и ленивая загрузка по локациям (§3.6). Реализация
 * поверх `IRenderer.loadAtlas` — задача OF-027. Каркас фиксирует контракт.
 */

export type LocationId = string;

export interface AssetManifest {
  version: number;
  locations: Record<
    LocationId,
    { atlases: string[]; audio: string[]; maps: string[]; data: string[] }
  >;
  /** UI, герой, общие эффекты — грузятся один раз. */
  shared: { atlases: string[]; audio: string[] };
}

export interface AssetLoader {
  loadShared(onProgress: (p: number) => void): Promise<void>;
  loadLocation(id: LocationId, onProgress: (p: number) => void): Promise<void>;
  unloadLocation(id: LocationId): void;
}
