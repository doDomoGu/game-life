import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'vue-router', 'pinia'],
    alias: {
      '@game-life/platform-web': path.resolve(__dirname, '../../packages/platform-web/src'),
      '@game-life/game-poker-memory': path.resolve(__dirname, '../../games/poker-memory/src'),
    },
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia', 'axios'],
  },
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [
        path.resolve(__dirname, '../..'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
