import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // sim/core тестируются без DOM — это часть контракта архитектуры
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**', 'src/sim/**'],
    },
  },
});
