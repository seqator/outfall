import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './tests/e2e',
  // Один воркер: несколько headless-Chromium с программным WebGL (нет
  // /dev/dri в песочнице/CI-контейнере) конкурируют за CPU и дают ложные
  // FPS-просадки и «скриншот не устаканился» в scoreboard/stress-тестах —
  // не баг игры, а артефакт параллельного запуска без GPU. На машине с
  // настоящим GPU (разработка, стенд на выставке) это ограничение не нужно,
  // но здесь параллелизм только вредит стабильности набора из 3 тестов.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
