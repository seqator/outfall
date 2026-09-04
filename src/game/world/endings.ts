/**
 * Разрешение одной из 5 концовок (`docs/narrative/main-quest.md` §5) по
 * итоговым флагам/репутации в момент, когда сцена задвижки
 * (`resolveFinalValveOutcome`, `demo-scene.ts`) фиксирует
 * `flag.truba_deystviye`. Чистая функция без знания о ECS/DOM — тот же
 * стиль, что `world/triggers.ts`/`game/inventory/inventory.ts`.
 *
 * Найдено шестой рецензией duxa-simulator (`docs/planerka/03-vs/
 * duxa-review-vs-6.md`, P0): сцена задвижки сама по себе только
 * записывает физическое действие игрока (`flag.truba_deystviye`) — какая
 * из 5 концовок это означает, зависело от накопленной репутации, но само
 * действие эту репутацию никак не проверяло, и никакого экрана-итога не
 * было вовсе (пятая живая проверка «Второй сброс» при `rep.energosbyt=0`).
 * Этот модуль — минимальное честное разрешение (текст, без слайдов
 * эпилога — те ждут арт-пайплайн, `OF-038`).
 *
 * ДОПУЩЕНИЕ: если конъюнкция условия конкретной концовки не выполнена
 * целиком (репутация не набрана), исход трактуется как «Чугунный век» —
 * так `main-quest.md` §5 сам описывает дефолт («концовка по умолчанию,
 * наименее требовательна к флагам»). Отдельный текст-разбор «ты выбрал X,
 * но не заслужил» — задача слайдов эпилога, не этого модуля.
 *
 * Пороги `rep.energosbyt`/`rep.chistye` (2026-09-04, `main-quest.md` §5,
 * найдено `duxa-review-vs-7.md` P0 №2): прежний `≥ 60` был физически
 * недостижим — честный максимум одного прохождения даёт диалоговый контент
 * игры (не бумажный расчёт по мёртвым `onEnter` стадий квеста, которые
 * никогда не исполняются) — `rep.energosbyt` максимум 25, `rep.chistye`
 * максимум 40. Новые пороги — `main-quest.md` §5: `rep.energosbyt ≥ 20`
 * (обе энергосбытовские концовки), `rep.chistye ≥ 30`.
 */

export type EndingId = 'vtoroy_sbros' | 'chugunny_vek' | 'vzryv_plotiny' | 'po_schetchiku' | 'ochen_chisty';

export interface EndingResult {
  readonly id: EndingId;
  readonly title: string;
  readonly summary: string;
}

const CHUGUNNY_VEK: EndingResult = {
  id: 'chugunny_vek',
  title: 'Чугунный век',
  summary:
    'Честная ржавчина: штамм-0 уничтожен вместе с лабораторией, ни одна фракция не получает решающего перевеса, трамвай №7 продолжает ходить.',
};

function numericFlag(flags: Readonly<Record<string, boolean | number | string>>, key: string): number {
  const value = flags[key];
  return typeof value === 'number' ? value : 0;
}

/** `trubaDeystviye` — значение `flag.truba_deystviye`, уже применённое к `flags` (см. вызов в `demo-scene.ts`: эффекты сцены задвижки применяются раньше, чем зовётся эта функция). */
export function resolveEnding(
  trubaDeystviye: string | undefined,
  flags: Readonly<Record<string, boolean | number | string>>,
): EndingResult {
  switch (trubaDeystviye) {
    case 'vtoroy_sbros':
      if (
        flags['flag.storona'] === 'energosbyt' &&
        flags['flag.energosbyt_final'] === 'polny_sbros' &&
        numericFlag(flags, 'rep.energosbyt') >= 20 &&
        flags['flag.vedeneev_sudba'] !== 'mertv'
      ) {
        return {
          id: 'vtoroy_sbros',
          title: 'Второй сброс',
          summary:
            'Пластик возвращается ценой леса и реки; Плотина становится империей, замыкающей на себе новый чёрный рынок пластика.',
        };
      }
      return CHUGUNNY_VEK;
    case 'po_schetchiku':
      if (
        flags['flag.storona'] === 'energosbyt' &&
        flags['flag.energosbyt_final'] === 'dozirovka' &&
        numericFlag(flags, 'rep.energosbyt') >= 20
      ) {
        return {
          id: 'po_schetchiku',
          title: 'По счётчику',
          summary:
            'Штамм-0 остаётся у Энергосбыта под дозированным контролем; восстановление идёт по тарифу, герой лично становится начальником Трубы.',
        };
      }
      return CHUGUNNY_VEK;
    case 'vzryv_plotiny':
      if (flags['flag.storona'] === 'chistye' && numericFlag(flags, 'rep.chistye') >= 30) {
        return {
          id: 'vzryv_plotiny',
          title: 'Пусть течёт',
          summary: 'Плотина взорвана усилиями Чистых, город рассыпается на речные деревни вдоль Ольхи.',
        };
      }
      return CHUGUNNY_VEK;
    case 'ochen_chisty':
      // `G` в сцене задвижки уже физически доступна только при `Смекалка ≤ 3`
      // (`demo-scene.ts`, `handleFinalValveKeyDown`) — повторно проверять
      // характеристику здесь незачем, `truba_deystviye` не может принять
      // это значение никаким другим путём.
      return {
        id: 'ochen_chisty',
        title: 'Очень чистый',
        summary: 'Ты сам поднимаешь пузырёк со штаммом-0 и пьёшь. Вопросов больше нет — ни у кого.',
      };
    case 'chugunny_vek':
    default:
      return CHUGUNNY_VEK;
  }
}
