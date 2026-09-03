#!/usr/bin/env tsx
/**
 * Проверка лимитов размера билда (docs/planerka/01-concept/engine-architect.md §4):
 *  - начальный JS-чанк ≤ 350 KB gzip;
 *  - весь JS ≤ 600 KB gzip;
 *  - весь билд (dist/) ≤ 80 MB.
 *
 * Атласы/аудио/локации ещё не появились (нет контента) — лимиты на них
 * добавятся вместе с ассет-пайплайном (OF-022/023/027/028), уже проверяются
 * тем же скриптом по мере добавления `public/atlases`, `public/audio`.
 *
 * Запуск: `npm run size-check` (часть `npm run build`), падает процесс с
 * ненулевым кодом, если лимит превышен.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = join(process.cwd(), 'dist');
const INDEX_HTML = join(DIST_DIR, 'index.html');

const LIMITS = {
  initialJsGzip: 350 * 1024,
  totalJsGzip: 600 * 1024,
  totalDistBytes: 80 * 1024 * 1024,
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path)).length;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function findInitialJsFiles(indexHtml: string): Set<string> {
  const refs = new Set<string>();
  const re = /(?:src|href)="([^"]+\.js)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml)) !== null) {
    const match = m[1];
    if (match) refs.add(match.replace(/^\.?\//, ''));
  }
  return refs;
}

function main(): void {
  let indexHtml: string;
  try {
    indexHtml = readFileSync(INDEX_HTML, 'utf-8');
  } catch {
    console.error(`size-check: не найден ${INDEX_HTML}. Сначала выполните \`vite build\`.`);
    process.exit(1);
    return;
  }

  const allFiles = walk(DIST_DIR);
  const jsFiles = allFiles.filter((f) => extname(f) === '.js');
  const initialRefs = findInitialJsFiles(indexHtml);

  let initialGzip = 0;
  let totalGzip = 0;
  let totalDistBytes = 0;

  const rows: Array<{ file: string; gzip: number; initial: boolean }> = [];

  for (const file of jsFiles) {
    const gzip = gzipSize(file);
    const relPath = relative(DIST_DIR, file);
    const isInitial = [...initialRefs].some((ref) => ref.endsWith(relPath));
    totalGzip += gzip;
    if (isInitial) initialGzip += gzip;
    rows.push({ file: relPath, gzip, initial: isInitial });
  }

  for (const file of allFiles) {
    totalDistBytes += statSync(file).size;
  }

  console.log('size-check: JS-чанки (gzip)');
  for (const row of rows.sort((a, b) => b.gzip - a.gzip)) {
    console.log(
      `  ${row.initial ? '[initial]' : '[lazy]   '} ${formatKb(row.gzip).padStart(10)}  ${row.file}`,
    );
  }
  console.log('');
  console.log(
    `  initial JS gzip: ${formatKb(initialGzip)} / лимит ${formatKb(LIMITS.initialJsGzip)}`,
  );
  console.log(`  total JS gzip:   ${formatKb(totalGzip)} / лимит ${formatKb(LIMITS.totalJsGzip)}`);
  console.log(
    `  dist size:       ${formatKb(totalDistBytes)} / лимит ${formatKb(LIMITS.totalDistBytes)}`,
  );

  const failures: string[] = [];
  if (initialGzip > LIMITS.initialJsGzip) {
    failures.push(
      `начальный JS-чанк ${formatKb(initialGzip)} превышает лимит ${formatKb(LIMITS.initialJsGzip)}`,
    );
  }
  if (totalGzip > LIMITS.totalJsGzip) {
    failures.push(`весь JS ${formatKb(totalGzip)} превышает лимит ${formatKb(LIMITS.totalJsGzip)}`);
  }
  if (totalDistBytes > LIMITS.totalDistBytes) {
    failures.push(
      `размер dist ${formatKb(totalDistBytes)} превышает лимит ${formatKb(LIMITS.totalDistBytes)}`,
    );
  }

  if (failures.length > 0) {
    console.error('\nsize-check: ПРОВАЛ');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\nsize-check: OK');
}

main();
