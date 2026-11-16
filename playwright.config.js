import { defineConfig } from '@playwright/test';

const pagesMode = process.env.ATLAS_TEST_PAGES === '1';
const pagesBase = (process.env.VITE_BASE_PATH || '/atlas-world-map/').replace(/\/+$/, '') + '/';
const baseURL = `http://127.0.0.1:4174${pagesMode ? pagesBase : '/'}`;

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: pagesMode
      ? 'pnpm build:pages && pnpm preview:pages --host 127.0.0.1 --port 4174 --strictPort'
      : process.env.ATLAS_TEST_DEV === '1'
        ? 'pnpm dev --host 127.0.0.1 --port 4174 --strictPort'
        : 'node build.mjs && node server.mjs',
    url: baseURL,
    env: {
      PORT: '4174',
      ...(pagesMode
        ? {
            VITE_BASE_PATH: pagesBase,
          }
        : {}),
    },
    reuseExistingServer: false,
    timeout: 90000,
  },
});
