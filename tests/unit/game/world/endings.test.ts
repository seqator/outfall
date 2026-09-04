import { describe, expect, it } from 'vitest';
import { resolveEnding } from '../../../../src/game/world/endings';

/**
 * Регрессия на P0 из шестой рецензии duxa-simulator (`duxa-review-vs-6.md`):
 * сцена задвижки записывала `flag.truba_deystviye`, не проверяя репутацию,
 * хотя `docs/narrative/main-quest.md` §5 требует порог для 4 из 5 концовок.
 *
 * Пороги ниже (`rep.energosbyt ≥ 20`, `rep.chistye ≥ 30`) — не исходные
 * `≥ 60` из шестой рецензии: седьмая рецензия (`duxa-review-vs-7.md`, P0 №2)
 * нашла, что `≥ 60` физически недостижим (честный максимум одного
 * прохождения — 25/40 соответственно), `main-quest.md` §5 пересчитан
 * 2026-09-04 под фактически достижимый максимум существующего контента.
 */
describe('resolveEnding: пять концовок main-quest.md §5', () => {
  it('5.1 «Второй сброс» — только при полном наборе условий, включая rep.energosbyt ≥ 20', () => {
    const goodFlags = {
      'flag.storona': 'energosbyt',
      'flag.energosbyt_final': 'polny_sbros',
      'rep.energosbyt': 20,
      'flag.vedeneev_sudba': 'zhiv',
    };
    expect(resolveEnding('vtoroy_sbros', goodFlags).id).toBe('vtoroy_sbros');

    // Найденный шестой рецензией баг — без репутации получалось «Второй сброс» с rep=0.
    expect(resolveEnding('vtoroy_sbros', { ...goodFlags, 'rep.energosbyt': 0 }).id).toBe('chugunny_vek');
    expect(resolveEnding('vtoroy_sbros', { ...goodFlags, 'rep.energosbyt': 19 }).id).toBe('chugunny_vek');
    expect(resolveEnding('vtoroy_sbros', { ...goodFlags, 'flag.vedeneev_sudba': 'mertv' }).id).toBe('chugunny_vek');
    expect(resolveEnding('vtoroy_sbros', { ...goodFlags, 'flag.storona': 'chistye' }).id).toBe('chugunny_vek');
  });

  it('5.2 «Чугунный век» — дефолт независимо от reputation, если действие было именно chugunny_vek', () => {
    expect(resolveEnding('chugunny_vek', {}).id).toBe('chugunny_vek');
    expect(resolveEnding('chugunny_vek', { 'flag.storona': 'progress2', 'rep.progress2': 20 }).id).toBe(
      'chugunny_vek',
    );
  });

  it('5.3 «Пусть течёт» — только при flag.storona=chistye и rep.chistye ≥ 30 (честный максимум 40)', () => {
    expect(resolveEnding('vzryv_plotiny', { 'flag.storona': 'chistye', 'rep.chistye': 30 }).id).toBe(
      'vzryv_plotiny',
    );
    expect(resolveEnding('vzryv_plotiny', { 'flag.storona': 'chistye', 'rep.chistye': 40 }).id).toBe(
      'vzryv_plotiny',
    );
    expect(resolveEnding('vzryv_plotiny', { 'flag.storona': 'chistye', 'rep.chistye': 29 }).id).toBe(
      'chugunny_vek',
    );
    expect(resolveEnding('vzryv_plotiny', { 'flag.storona': 'progress2', 'rep.chistye': 100 }).id).toBe(
      'chugunny_vek',
    );
  });

  it('5.4 «По счётчику» — только при energosbyt_final=dozirovka и rep.energosbyt ≥ 20 (честный максимум 25)', () => {
    const goodFlags = { 'flag.storona': 'energosbyt', 'flag.energosbyt_final': 'dozirovka', 'rep.energosbyt': 25 };
    expect(resolveEnding('po_schetchiku', goodFlags).id).toBe('po_schetchiku');
    expect(resolveEnding('po_schetchiku', { ...goodFlags, 'rep.energosbyt': 20 }).id).toBe('po_schetchiku');
    expect(resolveEnding('po_schetchiku', { ...goodFlags, 'rep.energosbyt': 19 }).id).toBe('chugunny_vek');
  });

  it('5.5 «Очень чистый» — доступна независимо от flag.storona (перекрывает любую ветку)', () => {
    expect(resolveEnding('ochen_chisty', {}).id).toBe('ochen_chisty');
    expect(resolveEnding('ochen_chisty', { 'flag.storona': 'energosbyt', 'rep.energosbyt': 0 }).id).toBe(
      'ochen_chisty',
    );
  });

  it('нештатное состояние flag.truba_deystviye — честный дефолт «Чугунный век», не падает', () => {
    expect(resolveEnding(undefined, {}).id).toBe('chugunny_vek');
    expect(resolveEnding('что-то-неизвестное', {}).id).toBe('chugunny_vek');
  });
});
