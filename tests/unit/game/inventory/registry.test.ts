import { describe, expect, it } from 'vitest';
import { DEV_ITEM_IDS, rawDevItems } from '../../../../src/game/inventory/fixtures/dev-items';
import { createItemRegistry, requireItem } from '../../../../src/game/inventory/registry';

describe('game/inventory/registry: createItemRegistry', () => {
  it('валидирует и индексирует фикстуру из 10 предметов по ItemSchema', () => {
    const registry = createItemRegistry(rawDevItems);
    expect(registry.size).toBe(10);
    expect(requireItem(registry, DEV_ITEM_IDS.pistolOgryzok).kind).toBe('weapon');
    expect(requireItem(registry, DEV_ITEM_IDS.junkKasha).value).toBe(1);
  });

  it('бросает на дублирующемся id', () => {
    expect(() => createItemRegistry([...rawDevItems, rawDevItems[0]])).toThrow(/дублирующийся id/);
  });

  it('бросает ZodError на невалидном предмете (kind weapon без weapon)', () => {
    expect(() =>
      createItemRegistry([
        {
          id: 'item.broken',
          nameKey: 'item.broken.name',
          descKey: 'item.broken.desc',
          kind: 'weapon',
          weight: 1,
          value: 1,
          stack: 1,
          effects: [],
        },
      ]),
    ).toThrow();
  });
});

describe('game/inventory/registry: requireItem', () => {
  it('бросает на отсутствующем id — ошибка целостности контента', () => {
    const registry = createItemRegistry(rawDevItems);
    expect(() => requireItem(registry, 'item.does_not_exist')).toThrow(/не найден в реестре/);
  });
});
