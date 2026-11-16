import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: process.env.ATLAS_TEST_DEV === '1'
      ? 'pnpm dev --host 127.0.0.1 --port 4174 --strictPort'
      : 'node build.mjs && node server.mjs',
    url: 'http://127.0.0.1:4174',
    env: { PORT: '4174' },
    reuseExistingServer: false,
    timeout: 90000,
  },
});
