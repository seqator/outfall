#!/usr/bin/env tsx
/**
 * Валидация контента: zod-схемы (`src/data/schemas/**`) + кросс-ссылки между
 * файлами (OF-009) — id, на которые ссылаются другие файлы, обязаны
 * существовать: `dialog.npc` → NPC на карте, `dialog`-эффекты → `item`/
 * `quest`, `map.enemySpawns`/`itemPickups` → `enemy`/`item`, `map.exits` →
 * `map`, `item.weapon.ammo` → `item` c `kind: 'ammo'`, `quest`-условия/
 * эффекты → `item`/`quest`, и все текстовые ключи (`nameKey`/`descKey`/
 * `titleKey`/`textKey`) → `i18n/ru.json`.
 *
 * Ожидаемая структура каталога данных (см. `docs/planerka/01-concept/
 * engine-architect.md` §2):
 *   <dir>/items.json  perks.json  quests.json  enemies.json   — JSON-массивы
 *   <dir>/maps/<id>.json  dialogs/<id>.json                    — по одному объекту на файл
 *   <dir>/i18n/ru.json (обязателен)  i18n/en.json (опционален, заглушка)
 *
 * CLI: `npm run validate` (по умолчанию каталог `public/data`; контента там
 * ещё нет — задачи OF-024/025/032/033/036/037 — поэтому отсутствие каталога
 * не является ошибкой). Можно указать другой каталог явно:
 *   `tsx tools/validate-data.ts tests/fixtures/data/valid`.
 *
 * `validateDataDir` — чистая экспортируемая функция без `process.exit`,
 * используется тестами (`tests/unit/validate-data.test.ts`) напрямую, без
 * запуска CLI в дочернем процессе.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import {
  DialogSchema,
  EnemySchema,
  I18nDictionarySchema,
  ItemSchema,
  MapSchema,
  PerkSchema,
  QuestSchema,
  walkCondition,
  type Dialog,
  type Effect,
  type Enemy,
  type GameMap,
  type Item,
  type Perk,
  type Quest,
} from '../src/data/schemas';

export interface ValidationIssue {
  /** Путь к файлу относительно каталога данных (или `<каталог>` для ошибок уровня каталога). */
  file: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Сколько записей каждого типа успешно прошло схему — для отчёта в консоли. */
  counts: {
    items: number;
    perks: number;
    quests: number;
    enemies: number;
    maps: number;
    dialogs: number;
  };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') + ': ' : ''}${issue.message}`)
    .join('; ');
}

function readJsonFile(path: string, rel: string, issues: ValidationIssue[]): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (e) {
    issues.push({ file: rel, message: `не удалось прочитать файл: ${(e as Error).message}` });
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    issues.push({ file: rel, message: `невалидный JSON: ${(e as Error).message}` });
    return undefined;
  }
}

function assertUnique(
  ids: string[],
  label: string,
  issues: ValidationIssue[],
  file: string,
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ file, message: `дублирующийся ${label} id "${id}"` });
    }
    seen.add(id);
  }
}

/** Загружает `<dataDir>/<fileName>` как JSON-массив и прогоняет каждый элемент через схему. */
function loadArrayFile<T>(
  dataDir: string,
  fileName: string,
  schema: z.ZodType<T>,
  issues: ValidationIssue[],
): T[] {
  const path = join(dataDir, fileName);
  if (!existsSync(path)) return [];
  const raw = readJsonFile(path, fileName, issues);
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push({ file: fileName, message: 'ожидался JSON-массив' });
    return [];
  }
  const out: T[] = [];
  raw.forEach((entry: unknown, i: number) => {
    const res = schema.safeParse(entry);
    if (!res.success) {
      issues.push({ file: `${fileName}[${i}]`, message: formatZodError(res.error) });
    } else {
      out.push(res.data);
    }
  });
  return out;
}

/** Загружает `<dataDir>/<subDir>/*.json` — по одному объекту (не массиву) на файл. */
function loadDirFiles<T>(
  dataDir: string,
  subDir: string,
  schema: z.ZodType<T>,
  issues: ValidationIssue[],
): T[] {
  const dirPath = join(dataDir, subDir);
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];
  const out: T[] = [];
  for (const entry of readdirSync(dirPath).sort()) {
    if (!entry.endsWith('.json')) continue;
    const rel = join(subDir, entry);
    const raw = readJsonFile(join(dirPath, entry), rel, issues);
    if (raw === undefined) continue;
    const res = schema.safeParse(raw);
    if (!res.success) {
      issues.push({ file: rel, message: formatZodError(res.error) });
    } else {
      out.push(res.data);
    }
  }
  return out;
}

/** Загружает словарь локализации; `required` управляет тем, считается ли отсутствие файла ошибкой. */
function loadDictFile(
  dataDir: string,
  fileName: string,
  required: boolean,
  issues: ValidationIssue[],
): Record<string, string> | undefined {
  const rel = join('i18n', fileName);
  const path = join(dataDir, 'i18n', fileName);
  if (!existsSync(path)) {
    if (required) issues.push({ file: rel, message: 'файл обязателен, но не найден' });
    return undefined;
  }
  const raw = readJsonFile(path, rel, issues);
  if (raw === undefined) return undefined;
  const res = I18nDictionarySchema.safeParse(raw);
  if (!res.success) {
    issues.push({ file: rel, message: formatZodError(res.error) });
    return undefined;
  }
  return res.data;
}

export function validateDataDir(dataDir: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!existsSync(dataDir)) {
    return {
      ok: true,
      issues: [],
      counts: { items: 0, perks: 0, quests: 0, enemies: 0, maps: 0, dialogs: 0 },
    };
  }

  const items = loadArrayFile<Item>(dataDir, 'items.json', ItemSchema, issues);
  const perks = loadArrayFile<Perk>(dataDir, 'perks.json', PerkSchema, issues);
  const quests = loadArrayFile<Quest>(dataDir, 'quests.json', QuestSchema, issues);
  const enemies = loadArrayFile<Enemy>(dataDir, 'enemies.json', EnemySchema, issues);
  const maps = loadDirFiles<GameMap>(dataDir, 'maps', MapSchema, issues);
  const dialogs = loadDirFiles<Dialog>(dataDir, 'dialogs', DialogSchema, issues);

  assertUnique(items.map((i) => i.id), 'item', issues, 'items.json');
  assertUnique(perks.map((p) => p.id), 'perk', issues, 'perks.json');
  assertUnique(quests.map((q) => q.id), 'quest', issues, 'quests.json');
  assertUnique(enemies.map((e) => e.id), 'enemy', issues, 'enemies.json');
  assertUnique(maps.map((m) => m.id), 'map', issues, 'maps/');
  assertUnique(dialogs.map((d) => d.id), 'dialog', issues, 'dialogs/');

  const itemIds = new Set(items.map((i) => i.id));
  const ammoItemIds = new Set(items.filter((i) => i.kind === 'ammo').map((i) => i.id));
  const enemyIds = new Set(enemies.map((e) => e.id));
  const questStages = new Map(quests.map((q) => [q.id, new Set(q.stages.map((s) => s.id))]));
  const mapIds = new Set(maps.map((m) => m.id));

  const npcIds = new Set<string>();
  for (const map of maps) {
    assertUnique(
      map.npcs.map((n) => n.id),
      'npc',
      issues,
      `maps/${map.id}`,
    );
    for (const npc of map.npcs) {
      if (npcIds.has(npc.id)) {
        issues.push({
          file: `maps/${map.id}.json`,
          message: `npc "${npc.id}" уже определён на другой карте — id NPC должен быть уникален глобально`,
        });
      }
      npcIds.add(npc.id);
    }
  }

  const ruDict = loadDictFile(dataDir, 'ru.json', true, issues);
  loadDictFile(dataDir, 'en.json', false, issues);
  const ruKeys = ruDict === undefined ? undefined : new Set(Object.keys(ruDict));

  function checkI18n(key: string, file: string, field: string): void {
    if (ruKeys !== undefined && !ruKeys.has(key)) {
      issues.push({ file, message: `${field} → i18n-ключ "${key}" отсутствует в i18n/ru.json` });
    }
  }

  function checkItemRef(id: string, file: string, field: string): void {
    if (!itemIds.has(id)) {
      issues.push({ file, message: `${field} → item "${id}" не найден в items.json` });
    }
  }

  function checkQuestRef(id: string, file: string, field: string): void {
    if (!questStages.has(id)) {
      issues.push({ file, message: `${field} → quest "${id}" не найден в quests.json` });
    }
  }

  function checkEffect(effect: Effect, file: string, field: string): void {
    if (effect.op === 'giveItem') checkItemRef(effect.item, file, `${field} (giveItem)`);
    if (effect.op === 'startQuest') checkQuestRef(effect.quest, file, `${field} (startQuest)`);
  }

  function checkConditionRefs(
    condition: Parameters<typeof walkCondition>[0],
    file: string,
    field: string,
  ): void {
    walkCondition(condition, (leaf) => {
      if (leaf.op === 'hasItem') checkItemRef(leaf.item, file, `${field} (hasItem)`);
      if (leaf.op === 'questStage') {
        const stages = questStages.get(leaf.quest);
        if (stages === undefined) {
          issues.push({
            file,
            message: `${field} (questStage) → quest "${leaf.quest}" не найден в quests.json`,
          });
        } else if (!stages.has(leaf.stage)) {
          issues.push({
            file,
            message: `${field} (questStage) → stage "${leaf.stage}" не найден в квесте "${leaf.quest}"`,
          });
        }
      }
    });
  }

  // items: ссылка на патрон + i18n
  for (const item of items) {
    const file = 'items.json';
    checkI18n(item.nameKey, file, `item "${item.id}".nameKey`);
    checkI18n(item.descKey, file, `item "${item.id}".descKey`);
    const ammo = item.weapon?.ammo;
    if (ammo !== undefined) {
      if (!itemIds.has(ammo)) {
        issues.push({ file, message: `item "${item.id}".weapon.ammo → item "${ammo}" не найден в items.json` });
      } else if (!ammoItemIds.has(ammo)) {
        issues.push({
          file,
          message: `item "${item.id}".weapon.ammo → "${ammo}" существует, но его kind не "ammo"`,
        });
      }
    }
  }

  // perks: только i18n (ничего внешнего не ссылается перками — требования, это enum-и, не id контента)
  for (const perk of perks) {
    const file = 'perks.json';
    checkI18n(perk.nameKey, file, `perk "${perk.id}".nameKey`);
    checkI18n(perk.descKey, file, `perk "${perk.id}".descKey`);
  }

  // enemies: i18n
  for (const enemy of enemies) {
    const file = 'enemies.json';
    checkI18n(enemy.nameKey, file, `enemy "${enemy.id}".nameKey`);
    checkI18n(enemy.attack.nameKey, file, `enemy "${enemy.id}".attack.nameKey`);
    checkI18n(enemy.weakness.nameKey, file, `enemy "${enemy.id}".weakness.nameKey`);
  }

  // quests: i18n + условия/эффекты стадий
  for (const quest of quests) {
    const file = 'quests.json';
    checkI18n(quest.titleKey, file, `quest "${quest.id}".titleKey`);
    for (const stage of quest.stages) {
      const stageField = `quest "${quest.id}".stages["${stage.id}"]`;
      checkI18n(stage.descKey, file, `${stageField}.descKey`);
      checkConditionRefs(stage.complete, file, `${stageField}.complete`);
      stage.onEnter.forEach((effect, i) => checkEffect(effect, file, `${stageField}.onEnter[${i}]`));
    }
  }

  // maps: спавны врагов/предметов, выходы, i18n
  for (const map of maps) {
    const file = `maps/${map.id}.json`;
    checkI18n(map.nameKey, file, `map "${map.id}".nameKey`);
    for (const npc of map.npcs) {
      checkI18n(npc.nameKey, file, `map "${map.id}".npcs["${npc.id}"].nameKey`);
    }
    for (const spawn of map.enemySpawns) {
      if (!enemyIds.has(spawn.enemyId)) {
        issues.push({
          file,
          message: `map "${map.id}".enemySpawns["${spawn.id}"].enemyId → enemy "${spawn.enemyId}" не найден в enemies.json`,
        });
      }
    }
    for (const pickup of map.itemPickups) {
      if (!itemIds.has(pickup.itemId)) {
        issues.push({
          file,
          message: `map "${map.id}".itemPickups["${pickup.id}"].itemId → item "${pickup.itemId}" не найден в items.json`,
        });
      }
    }
    for (const trigger of map.triggers) {
      const triggerField = `map "${map.id}".triggers["${trigger.id}"]`;
      if (trigger.condition) checkConditionRefs(trigger.condition, file, `${triggerField}.condition`);
      trigger.effects.forEach((effect, i) => checkEffect(effect, file, `${triggerField}.effects[${i}]`));
    }
    for (const exit of map.exits) {
      if (!mapIds.has(exit.toMap)) {
        issues.push({
          file,
          message: `map "${map.id}".exits["${exit.id}"].toMap → map "${exit.toMap}" не найден`,
        });
      }
    }
  }

  // dialogs: владелец-npc, i18n, эффекты/условия в узлах
  for (const dialog of dialogs) {
    const file = `dialogs/${dialog.id}.json`;
    if (!npcIds.has(dialog.npc)) {
      issues.push({
        file,
        message: `dialog "${dialog.id}".npc → npc "${dialog.npc}" не найден ни на одной карте`,
      });
    }
    for (const [nodeId, node] of Object.entries(dialog.nodes)) {
      const nodeField = `dialog "${dialog.id}".nodes["${nodeId}"]`;
      checkI18n(node.textKey, file, `${nodeField}.textKey`);
      node.choices.forEach((choice, i) => {
        const choiceField = `${nodeField}.choices[${i}]`;
        checkI18n(choice.textKey, file, `${choiceField}.textKey`);
        if (choice.condition) checkConditionRefs(choice.condition, file, `${choiceField}.condition`);
        choice.effects.forEach((effect, j) => checkEffect(effect, file, `${choiceField}.effects[${j}]`));
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      items: items.length,
      perks: perks.length,
      quests: quests.length,
      enemies: enemies.length,
      maps: maps.length,
      dialogs: dialogs.length,
    },
  };
}

function main(): void {
  const target = process.argv[2] ?? join(process.cwd(), 'public', 'data');
  const dataDir = target;
  const displayPath = relative(process.cwd(), dataDir) || '.';

  const result = validateDataDir(dataDir);

  if (!existsSync(dataDir)) {
    console.log(
      `validate: каталог "${displayPath}" не найден — контента ещё нет (см. OF-024/025/032/033/036/037 в docs/BACKLOG.md), пропускаю.`,
    );
    process.exit(0);
  }

  const { counts } = result;
  console.log(
    `validate: "${displayPath}" — items=${counts.items} perks=${counts.perks} quests=${counts.quests} enemies=${counts.enemies} maps=${counts.maps} dialogs=${counts.dialogs}`,
  );

  if (!result.ok) {
    console.error(`\nvalidate: ПРОВАЛ — ${result.issues.length} ошибок:\n`);
    for (const issue of result.issues) {
      console.error(`  [${issue.file}] ${issue.message}`);
    }
    process.exit(1);
  }

  console.log('validate: OK — схемы и кросс-ссылки в порядке.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
