/**
 * Стадия `entityCollision` (SYSTEM_ORDER: input → ai → movement → collision →
 * entityCollision → combat → ... — OF-052, `docs/design/entity-collision-of-052.md`
 * §2.2). Стены (`collisionSystem`) уже разрешены к моменту этой стадии;
 * здесь та же самая идея — осевой откат к `prevX/prevY` — применяется к
 * паре сущность-сущность, а не сущность-стена. Без этой стадии сущности
 * (герой, враги, Босс-задвижка) взаимно прозрачны — можно физически пройти
 * насквозь через тело врага (repro `duxa-review-vs-6..-9`).
 *
 * Ключевое решение (§2.1 документа): откат к `prevX/prevY`, не симметричный
 * «пуш». `prevX/prevY` — позиция, уже легальная относительно стен на конец
 * предыдущего тика (инвариант, который поддерживает `collisionSystem`
 * каждый тик) — откат к ней не может создать новое нарушение стен.
 *
 * Детерминизм (§2.3): читает только порядок `world.query()` (порядок
 * `world.create()`, детерминированный) и чистую арифметику — `world.rng` не
 * трогает. Это обязательное условие для `tests/integration/replay.test.ts`.
 *
 * Наивный O(n²) — без бакетов (§1.3 шаг 1 документа): на реальном контенте
 * игры максимум 7 `collidable`-сущностей одновременно (§1.1), вопрос
 * оптимизации не стоит; на синтетическом `?stress=1` (300 врагов) — вопрос
 * решён эмпирическим гейтом `tests/e2e/stress.spec.ts`, не аналитикой.
 *
 * Без выделения памяти в горячем цикле сверх одного переиспользуемого
 * массива-снимка на тик (тот же принцип, что уже требует докстринг
 * `collision.ts`).
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import type { TransformComponent } from '../components';

interface CollidableEntity {
  /** Живая ссылка на компонент — мутации видны сразу всем последующим проверкам в этом же тике (§2.3). */
  readonly t: TransformComponent;
  readonly radius: number;
}

/** Переиспользуемый между тиками снимок — не пересоздаётся заново каждый вызов (без аллокаций сверх одного `.length = 0`). */
const snapshot: CollidableEntity[] = [];

function isBlockedByEntities(
  list: readonly CollidableEntity[],
  skipIndex: number,
  x: number,
  y: number,
  radius: number,
): boolean {
  for (let k = 0; k < list.length; k++) {
    if (k === skipIndex) continue;
    const other = list[k];
    // `k < list.length` — индекс всегда в границах; проверка нужна только
    // из-за `noUncheckedIndexedAccess`, не достижимая ветка на практике.
    /* v8 ignore next */
    if (!other) continue;
    const minDist = radius + other.radius;
    const dx = x - other.t.x;
    const dy = y - other.t.y;
    if (dx * dx + dy * dy < minDist * minDist) return true;
  }
  return false;
}

export function entityCollisionSystem(world: World, _dt: number, _input: InputSnapshot): void {
  snapshot.length = 0;

  for (const entity of world.query('transform', 'collidable')) {
    const transform = world.store('transform').get(entity);
    const collidable = world.store('collidable').get(entity);
    // `world.query(...)` уже гарантирует наличие обоих компонентов — защита
    // инварианта ECS, а не достижимая ветка через публичный API.
    /* v8 ignore next */
    if (!transform || !collidable) continue;

    const health = world.store('health').get(entity);
    // Мёртвая, но ещё не удалённая сущность (`world.destroy()` происходит
    // позже, в `combatSystem`, который идёт после этой стадии) не блокирует
    // — §2.4 документа. Строго избыточно в текущем `SYSTEM_ORDER` (труп не
    // может пережить тик и попасть сюда в следующем), оставлено как защита
    // инварианта.
    if (health && health.hp <= 0) continue;

    snapshot.push({ t: transform, radius: collidable.radius });
  }

  for (let i = 0; i < snapshot.length; i++) {
    const entry = snapshot[i];
    // `i < snapshot.length` — индекс всегда в границах; проверка нужна
    // только из-за `noUncheckedIndexedAccess`, не достижимая ветка на практике.
    /* v8 ignore next */
    if (!entry) continue;
    const { t, radius } = entry;
    const fromX = t.prevX;
    const fromY = t.prevY;

    let resolvedX = t.x;
    let resolvedY = t.y;

    if (isBlockedByEntities(snapshot, i, resolvedX, fromY, radius)) {
      resolvedX = fromX;
    }
    if (isBlockedByEntities(snapshot, i, resolvedX, resolvedY, radius)) {
      resolvedY = fromY;
    }

    t.x = resolvedX;
    t.y = resolvedY;
  }
}
