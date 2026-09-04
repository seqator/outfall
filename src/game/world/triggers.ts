/**
 * Триггеры карты (`GameMap.triggers`, `src/data/schemas/map.ts`) — на входе
 * геометрия и `ConditionSchema`/`EffectSchema` из `data/schemas/rules.ts`,
 * тот же язык, что уже используют диалоги (`game/dialogue/interpreter.ts`,
 * переиспользуется, а не дублируется). До этой задачи `MapTrigger[]` лежал
 * в `public/data/maps/truba.json` мёртвым грузом — рецензия `docs/planerka/
 * 03-vs/duxa-review-vs.md` п.3 поймала это прямо: ни подсказки управления,
 * ни волны врагов по сценарию, ни крючка пролога, потому что ничто в коде
 * `triggers` не читало.
 *
 * `TriggerRunner` сам не решает, что означает конкретный флаг (спавн волны,
 * открытие диалога, надпись на экране) — это дело вызывающей стороны
 * (`demo-scene.ts`), которая читает `state.flags` после каждого вызова
 * `update()` и реагирует на переходы false→true. Здесь только: проверка
 * радиуса + `once` + `condition` + применение `effects` к `GameState`.
 */

import type { GameMap, MapTrigger } from '../../data/schemas';
import { applyEffects, evaluateCondition, type GameState } from '../dialogue/interpreter';

export interface TriggerRunner {
  /**
   * Проверяет все не сработавшие триггеры против позиции героя; возвращает
   * обновлённый `GameState` (эффекты сработавших триггеров уже применены —
   * тот же принцип, что `dialog-runner.choose()`: не мутирует, а возвращает
   * новое состояние) и список id триггеров, сработавших именно в этом
   * вызове (для отладки/логов, не обязателен вызывающей стороне).
   */
  update(heroX: number, heroY: number, state: GameState): { state: GameState; firedIds: readonly string[] };
}

function isWithinRadius(trigger: MapTrigger, x: number, y: number): boolean {
  const dx = trigger.position.x - x;
  const dy = trigger.position.y - y;
  return dx * dx + dy * dy <= trigger.radius * trigger.radius;
}

export function createTriggerRunner(map: GameMap): TriggerRunner {
  const firedOnce = new Set<string>();

  return {
    update(heroX, heroY, state) {
      let nextState = state;
      const firedIds: string[] = [];

      for (const trigger of map.triggers) {
        if (trigger.once && firedOnce.has(trigger.id)) continue;
        if (!isWithinRadius(trigger, heroX, heroY)) continue;
        if (trigger.condition !== undefined && !evaluateCondition(trigger.condition, nextState)) continue;

        nextState = applyEffects(nextState, trigger.effects);
        if (trigger.once) firedOnce.add(trigger.id);
        firedIds.push(trigger.id);
      }

      return { state: nextState, firedIds };
    },
  };
}
