/**
 * `StorageLike`-заглушка в памяти (OF-019) — для тестов `save-store.test.ts`
 * и любого места, где нет реального `localStorage` (Node/Vitest,
 * `environment: 'node'`, `vitest.config.ts`). Не экспортируется как «сделай
 * так в проде»: демо-сцена передаёт настоящий `window.localStorage`.
 */

import type { StorageLike } from './save-store';

export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}
