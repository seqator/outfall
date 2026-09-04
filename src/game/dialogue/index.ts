/**
 * Публичный вход `game/dialogue` (OF-018): чистая логика (интерпретатор
 * условий/эффектов, обход графа диалога) без DOM/рендера. UI
 * (`src/ui/dialogue`) не импортирует этот модуль напрямую (граница
 * `import-x/no-restricted-paths`, см. `eslint.config.js`): их связывает
 * `dialogue-screen.ts` в этом же каталоге — единственный файл `game`,
 * которому можно знать и про логику, и про `ui`.
 */

export * from './interpreter';
export * from './dialog-runner';
export * from './check-labels';
export * from './dialogue-screen';
