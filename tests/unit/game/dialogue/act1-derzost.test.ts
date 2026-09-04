/**
 * Три сцены дерзости Акта 1 (OF-046) + «Я кран» на реальном контенте
 * (`public/data/dialogs/act1-*.json`, конвертация сценария `docs/narrative/
 * quests/act1-derzost.md` в `DialogSchema` после того, как карты Акта 1
 * (OF-033) завели нужные `npc.*`). Отдельная регрессия на баг, найденный
 * при этой конвертации: `main-quest.md` описывает `rep.*` дельтами, а
 * `setFlag` — абсолютная перезапись; здесь два независимых диалога реально
 * трогают один и тот же `rep.progress2` через `incrementFlag`
 * (`src/data/schemas/rules.ts`) и должны накапливаться, не перезаписываться
 * (см. `interpreter.test.ts` — там то же самое на уровне чистой функции).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DialogSchema, type Dialog } from '../../../../src/data/schemas/dialog';
import { choose, viewNode } from '../../../../src/game/dialogue/dialog-runner';
import { createGameState } from '../../../../src/game/dialogue/interpreter';

const DIALOGS_DIR = join(__dirname, '../../../../public/data/dialogs');

function loadDialog(fileName: string): Dialog {
  const raw = JSON.parse(readFileSync(join(DIALOGS_DIR, fileName), 'utf-8')) as unknown;
  return DialogSchema.parse(raw);
}

function pickAndChoose(dialog: Dialog, nodeId: string, textKey: string, state: ReturnType<typeof createGameState>) {
  const view = viewNode(dialog, nodeId, state);
  const choice = view.choices.find((c) => c.textKey === textKey);
  expect(choice).toBeDefined();
  return choose(dialog, nodeId, choice!.choiceIndex, state);
}

describe('act1-derzost: «Отработка» → «Рубильник» — репутация rep.progress2 накапливается, не перезаписывается', () => {
  it('sdal (+15) затем otklyuchil (−10) дают итоговые +5, не −10', () => {
    const tolya = loadDialog('act1-otrabotka-tolya.json');
    const rubilnik = loadDialog('act1-rubilnik.json');

    let state = createGameState();
    const afterFound = pickAndChoose(tolya, 'found', 'dialog.otrabotka_tolya.choice.sdal', state);
    state = pickAndChoose(tolya, afterFound.nextNodeId!, 'dialog.otrabotka_tolya.choice.yasno', afterFound.state)
      .state;
    expect(state.flags['rep.progress2']).toBe(15);
    expect(state.flags['flag.otrabotka_tolya']).toBe('sdal');

    const afterStart = pickAndChoose(rubilnik, 'start', 'dialog.rubilnik.choice.otklyuchit', state);
    state = pickAndChoose(
      rubilnik,
      afterStart.nextNodeId!,
      'dialog.rubilnik.choice.mnogotochie',
      afterStart.state,
    ).state;

    expect(state.flags['rep.progress2']).toBe(5);
    expect(state.flags['rep.energosbyt']).toBe(15);
    expect(state.flags['flag.rubilnik']).toBe('otklyuchil');
  });
});

describe('act1-derzost: «Я кран» — оба исхода', () => {
  const dialog = loadDialog('act1-ya-kran.json');

  it('убить Палыча — flag.palych_ubit=true, rep.progress2 абсолютно сброшен в −100 (не дельта)', () => {
    let state = createGameState();
    const afterConfession = pickAndChoose(dialog, 'confession', 'dialog.ya_kran.choice.i_chto', state);
    expect(state.flags['rep.progress2']).toBeUndefined();
    state = afterConfession.state;
    expect(state.flags['flag.palych_pravda']).toBe(true);

    const afterKran = pickAndChoose(dialog, afterConfession.nextNodeId!, 'dialog.ya_kran.choice.ubit', state);
    expect(afterKran.state.flags['flag.palych_ubit']).toBe(true);
    expect(afterKran.state.flags['rep.progress2']).toBe(-100);
  });

  it('пощадить Палыча — flag.palych_ubit=false, репутация не трогается этим выбором', () => {
    let state = createGameState();
    const afterConfession = pickAndChoose(dialog, 'confession', 'dialog.ya_kran.choice.i_chto', state);
    state = afterConfession.state;

    const afterKran = pickAndChoose(dialog, afterConfession.nextNodeId!, 'dialog.ya_kran.choice.poshadit', state);
    expect(afterKran.state.flags['flag.palych_ubit']).toBe(false);
    expect(afterKran.state.flags['rep.progress2']).toBeUndefined();
  });
});

describe('act1-derzost: «Для колодца» и остальные сцены проходят обоими исходами без ошибок', () => {
  it('dlya_kolodtsa — privel/otkazal дают противоположный знак rep.chistye', () => {
    const dialog = loadDialog('act1-dlya-kolodtsa.json');

    const privelFirst = pickAndChoose(dialog, 'start', 'dialog.dlya_kolodtsa.choice.privel', createGameState());
    const privel = pickAndChoose(
      dialog,
      privelFirst.nextNodeId!,
      'dialog.dlya_kolodtsa.choice.dalshe',
      privelFirst.state,
    );
    expect(privel.state.flags['rep.chistye']).toBe(15);

    const otkazalFirst = pickAndChoose(dialog, 'start', 'dialog.dlya_kolodtsa.choice.otkazal', createGameState());
    const otkazal = pickAndChoose(
      dialog,
      otkazalFirst.nextNodeId!,
      'dialog.dlya_kolodtsa.choice.ne_stoilo',
      otkazalFirst.state,
    );
    expect(otkazal.state.flags['rep.chistye']).toBe(-10);
  });
});
