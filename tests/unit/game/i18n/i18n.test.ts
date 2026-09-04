/**
 * OF-019: `src/game/i18n/index.ts` — резолвер `t(key)`, валидация словаря,
 * загрузка через (заглушку) `fetch`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createI18n,
  loadI18nDictionary,
  parseI18nDictionary,
  type I18nFetch,
} from '../../../../src/game/i18n';

describe('i18n: parseI18nDictionary', () => {
  it('принимает плоский словарь строк', () => {
    const dict = parseI18nDictionary({ 'npc.sanitar.name': 'Санитар' });
    expect(dict).toEqual({ 'npc.sanitar.name': 'Санитар' });
  });

  it('бросает на невалидном словаре (пустая строка-значение)', () => {
    expect(() => parseI18nDictionary({ 'npc.sanitar.name': '' })).toThrow();
  });

  it('бросает на не-объекте', () => {
    expect(() => parseI18nDictionary('строка, не словарь')).toThrow();
  });
});

describe('i18n: createI18n / t()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает перевод для известного ключа', () => {
    const i18n = createI18n('ru', { 'npc.sanitar.name': 'Санитар' });
    expect(i18n.t('npc.sanitar.name')).toBe('Санитар');
  });

  it('на неизвестном ключе возвращает сам ключ и не бросает исключение', () => {
    const i18n = createI18n('ru', {});
    expect(() => i18n.t('npc.neizvesten.name')).not.toThrow();
    expect(i18n.t('npc.neizvesten.name')).toBe('npc.neizvesten.name');
  });

  it('на неизвестном ключе пишет предупреждение в консоль', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i18n = createI18n('en', {});
    i18n.t('npc.neizvesten.name');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('npc.neizvesten.name');
  });
});

describe('i18n: loadI18nDictionary', () => {
  it('грузит и валидирует словарь по locale через переданный fetch', async () => {
    const fakeFetch: I18nFetch = (url) => {
      expect(url).toBe('/data/i18n/ru.json');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ 'npc.sanitar.name': 'Санитар' }),
      });
    };
    const dict = await loadI18nDictionary('ru', '/data/i18n', fakeFetch);
    expect(dict).toEqual({ 'npc.sanitar.name': 'Санитар' });
  });

  it('бросает при неуспешном HTTP-ответе', async () => {
    const fakeFetch: I18nFetch = () =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    await expect(loadI18nDictionary('en', '/data/i18n', fakeFetch)).rejects.toThrow(/404/);
  });

  it('бросает, если тело ответа не проходит I18nDictionarySchema', async () => {
    const fakeFetch: I18nFetch = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) });
    await expect(loadI18nDictionary('ru', '/data/i18n', fakeFetch)).rejects.toThrow();
  });
});
