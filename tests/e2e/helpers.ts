import type { Page } from '@playwright/test';

/**
 * Открывает игру и проходит титульный экран (`src/ui/title-screen.ts`,
 * `main.ts`) — общий первый шаг для всех e2e-сценариев, которым нужна
 * реально запущенная demo-сцена, а не титульник. Проверяет саму кнопку —
 * это заодно и минимальная регрессия на «титульник вообще работает».
 */
export async function startGame(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: 'ПОГНАЛИ' }).click();
}
