import { defineConfig } from 'vite';
import { createDevProxy } from './dev-proxy.mjs';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: createDevProxy(),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    emptyOutDir: true,
  },
  worker: { format: 'es' },
});
