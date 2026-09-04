/**
 * OF-018: обход графа диалога (`src/game/dialogue/dialog-runner.ts`) на
 * реальном контенте пролога (`public/data/dialogs/prolog-*.json`, OF-024) —
 * используются как сквозной пример, без выдуманного контента (см. задачу).
 *
 * - `prolog-vybor.json`: снапшот-тест обхода графа обоими исходами
 *   («спас» / «ключ», см. `docs/narrative/main-quest.md` §0.2 `flag.prolog_vybor`).
 * - `prolog-smotritel.json`: полный проход через интерпретатор — обе
 *   проверки навыков видны в возвращаемом UI-состоянии, ветки различаются.
 * - недостижимый узел (OF-018 п.6) — синтетический фикстур-диалог, все
 *   ветки к «секретному» узлу заблокированы условием, невыполнимым из
 *   стартового состояния этого диалога.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DialogSchema, type Dialog } from '../../../../src/data/schemas/dialog';
import { choose, findUnreachableNodeIds, viewNode } from '../../../../src/game/dialogue/dialog-runner';
import { createGameState } from '../../../../src/game/dialogue/interpreter';

const DIALOGS_DIR = join(__dirname, '../../../../public/data/dialogs');

function loadDialog(fileName: string): Dialog {
  const raw = JSON.parse(readFileSync(join(DIALOGS_DIR, fileName), 'utf-8')) as unknown;
  return DialogSchema.parse(raw);
}

describe('dialog-runner: prolog-vybor.json — снапшот обхода обоими исходами', () => {
  const dialog = loadDialog('prolog-vybor.json');

  it('исход «спас»', () => {
    const start = viewNode(dialog, dialog.start, createGameState());
    const spasChoice = start.choices.find((c) => c.textKey === 'dialog.prolog_vybor.choice.spasti');
    expect(spasChoice).toBeDefined();

    const afterChoice = choose(dialog, dialog.start, spasChoice!.choiceIndex, createGameState());
    expect(afterChoice.nextNodeId).toBe('spas_end');

    const endView = viewNode(dialog, afterChoice.nextNodeId!, afterChoice.state);
    expect(endView.ended).toBe(true);

    expect({
      flags: afterChoice.state.flags,
      finalNodeId: afterChoice.nextNodeId,
      finalSpeaker: endView.speaker,
    }).toMatchSnapshot();
  });

  it('исход «ключ»', () => {
    const start = viewNode(dialog, dialog.start, createGameState());
    const klyuchChoice = start.choices.find((c) => c.textKey === 'dialog.prolog_vybor.choice.klyuch');
    expect(klyuchChoice).toBeDefined();

    const afterChoice = choose(dialog, dialog.start, klyuchChoice!.choiceIndex, createGameState());
    expect(afterChoice.nextNodeId).toBe('klyuch_end');

    const endView = viewNode(dialog, afterChoice.nextNodeId!, afterChoice.state);
    expect(endView.ended).toBe(true);

    expect({
      flags: afterChoice.state.flags,
      finalNodeId: afterChoice.nextNodeId,
      finalSpeaker: endView.speaker,
    }).toMatchSnapshot();
  });

  it('оба исхода дают разные флаги на выходе', () => {
    const spas = choose(
      dialog,
      dialog.start,
      viewNode(dialog, dialog.start, createGameState()).choices.find(
        (c) => c.textKey === 'dialog.prolog_vybor.choice.spasti',
      )!.choiceIndex,
      createGameState(),
    );
    const klyuch = choose(
      dialog,
      dialog.start,
      viewNode(dialog, dialog.start, createGameState()).choices.find(
        (c) => c.textKey === 'dialog.prolog_vybor.choice.klyuch',
      )!.choiceIndex,
      createGameState(),
    );
    expect(spas.state.flags['flag.prolog_vybor']).toBe('spas');
    expect(klyuch.state.flags['flag.prolog_vybor']).toBe('klyuch');
  });
});

describe('dialog-runner: prolog-smotritel.json — полный проход, обе проверки навыков видны', () => {
  const dialog = loadDialog('prolog-smotritel.json');

  it('[Язык 5] — успех: check.passed=true, «tupoy»-ветка скрыта (Смекалка ≥ 4 по умолчанию)', () => {
    const state = createGameState(); // дефолт: yazyk=5, smekalka=5
    const view = viewNode(dialog, dialog.start, state);

    const yazykChoice = view.choices.find((c) => c.textKey === 'dialog.prolog_smotritel.choice.yazyk');
    expect(yazykChoice?.check).toEqual({ stat: 'yazyk', dc: 5, passed: true });

    const tupoyChoice = view.choices.find((c) => c.textKey === 'dialog.prolog_smotritel.choice.tupoy');
    expect(tupoyChoice).toBeUndefined(); // условие `not(smekalka>=4)` ложно при smekalka=5 — вариант скрыт

    // Все три исхода узла ведут к завершению диалога (next: null).
    for (const choice of view.choices) {
      const result = choose(dialog, dialog.start, choice.choiceIndex, state);
      expect(result.nextNodeId).toBeNull();
    }
  });

  it('[Язык 5] — провал: check.passed=false, но вариант остаётся видимым (честный порог)', () => {
    const state = createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 5, tvyordost: 5, yazyk: 3, kurazh: 5 } });
    const view = viewNode(dialog, dialog.start, state);
    const yazykChoice = view.choices.find((c) => c.textKey === 'dialog.prolog_smotritel.choice.yazyk');
    expect(yazykChoice?.check).toEqual({ stat: 'yazyk', dc: 5, passed: false });
  });

  it('[Смекалка ≤ 3] — низкий интеллект открывает скрытую «tupoy»-ветку', () => {
    const state = createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 3, tvyordost: 5, yazyk: 5, kurazh: 5 } });
    const view = viewNode(dialog, dialog.start, state);
    const tupoyChoice = view.choices.find((c) => c.textKey === 'dialog.prolog_smotritel.choice.tupoy');
    expect(tupoyChoice).toBeDefined();
    expect(tupoyChoice?.check).toBeUndefined(); // это условие видимости, не пороговая проверка
  });

  it('видна разница веток между состояниями: набор видимых вариантов и их check.passed различаются', () => {
    const talkative = viewNode(
      dialog,
      dialog.start,
      createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 6, tvyordost: 5, yazyk: 6, kurazh: 5 } }),
    );
    const dimwit = viewNode(
      dialog,
      dialog.start,
      createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 3, tvyordost: 5, yazyk: 2, kurazh: 5 } }),
    );
    expect(talkative.choices.map((c) => c.textKey)).toMatchSnapshot('talkative');
    expect(dimwit.choices.map((c) => ({ textKey: c.textKey, check: c.check }))).toMatchSnapshot('dimwit');
  });
});

describe('dialog-runner: prolog-kruchok.json — линейный проход, все узлы диалога среза достижимы', () => {
  it('единственный путь ведёт из start в title и завершает диалог', () => {
    const dialog = loadDialog('prolog-kruchok.json');
    const start = viewNode(dialog, dialog.start, createGameState());
    expect(start.choices).toHaveLength(1);

    const afterChoice = choose(dialog, dialog.start, 0, createGameState());
    expect(afterChoice.nextNodeId).toBe('title');

    const titleView = viewNode(dialog, afterChoice.nextNodeId!, afterChoice.state);
    expect(titleView.ended).toBe(true);
  });

  it.each(['prolog-vybor.json', 'prolog-smotritel.json', 'prolog-kruchok.json'])(
    '%s: в готовом контенте среза нет недостижимых узлов',
    (fileName) => {
      const dialog = loadDialog(fileName);
      expect(findUnreachableNodeIds(dialog, createGameState())).toEqual([]);
    },
  );
});

describe('dialog-runner: недостижимый узел (OF-018 п.6)', () => {
  it('узел, к которому ведёт только логически невыполнимое условие, не входит в reachableNodeIds', () => {
    const dialog: Dialog = DialogSchema.parse({
      id: 'dialog.test_unreachable',
      npc: 'npc.test',
      start: 'start',
      nodes: {
        start: {
          speaker: 'narrator',
          textKey: 'dialog.test.start',
          choices: [
            { textKey: 'dialog.test.choice.normal', next: 'end' },
            {
              textKey: 'dialog.test.choice.secret',
              next: 'secret',
              // Противоречиво для любого состояния: флаг не может одновременно
              // равняться и true, и false — ни один игровой стейт этого диалога
              // (эффекты в диалоге флаг не трогают) не сделает условие истинным.
              condition: {
                op: 'all',
                conditions: [
                  { op: 'flag', key: 'flag.never_set', eq: true },
                  { op: 'flag', key: 'flag.never_set', eq: false },
                ],
              },
            },
          ],
        },
        secret: { speaker: 'narrator', textKey: 'dialog.test.secret', choices: [] },
        end: { speaker: 'narrator', textKey: 'dialog.test.end', choices: [] },
      },
    });

    const unreachable = findUnreachableNodeIds(dialog, createGameState());
    expect(unreachable).toEqual(['secret']);
  });

  it('контрольный случай — если условие выполнимо, узел засчитывается достижимым', () => {
    const dialog: Dialog = DialogSchema.parse({
      id: 'dialog.test_reachable',
      npc: 'npc.test',
      start: 'start',
      nodes: {
        start: {
          speaker: 'narrator',
          textKey: 'dialog.test.start',
          choices: [
            {
              textKey: 'dialog.test.choice.unlock',
              next: 'unlocked',
              effects: [{ op: 'setFlag', key: 'flag.opened', value: true }],
            },
          ],
        },
        unlocked: {
          speaker: 'narrator',
          textKey: 'dialog.test.unlocked',
          choices: [
            {
              textKey: 'dialog.test.choice.secret',
              next: 'secret',
              condition: { op: 'flag', key: 'flag.opened', eq: true },
            },
          ],
        },
        secret: { speaker: 'narrator', textKey: 'dialog.test.secret', choices: [] },
      },
    });

    expect(findUnreachableNodeIds(dialog, createGameState())).toEqual([]);
  });
});
