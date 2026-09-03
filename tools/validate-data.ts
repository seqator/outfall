#!/usr/bin/env tsx
/**
 * Заглушка: полная валидация `public/data/**` по zod-схемам и кросс-ссылкам
 * (id/next/textKey существуют, диалоговый граф без недостижимых узлов) —
 * задача OF-009. Пока схем контента и `public/data` ещё нет, скрипт просто
 * подтверждает, что общие примитивы схем (`src/data/schemas`) компилируются
 * и работают.
 */

import { IdSchema } from '../src/data/schemas';

const probe = IdSchema.safeParse('item.example');
if (!probe.success) {
  console.error('validate: базовая zod-схема (IdSchema) не работает — сломан каркас data/schemas.');
  process.exit(1);
}

console.log('validate: каркас схем контента в порядке.');
console.log('validate: полная валидация public/data/** — задача OF-009 (см. docs/BACKLOG.md).');
