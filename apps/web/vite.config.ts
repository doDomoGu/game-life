import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [vue()],
    resolve: {
      dedupe: ['vue', 'vue-router', 'pinia'],
      alias: {
        '@game-life/platform-web': path.resolve(__dirname, '../../packages/platform-web/src'),
        '@game-life/game-bingo': path.resolve(__dirname, '../../games/bingo/src'),
        '@game-life/game-draw-guess': path.resolve(__dirname, '../../games/draw-guess/src'),
        '@game-life/game-hanabi': path.resolve(__dirname, '../../games/hanabi/src'),
        '@game-life/game-poker-memory': path.resolve(__dirname, '../../games/poker-memory/src'),
        '@game-life/game-sudoku': path.resolve(__dirname, '../../games/sudoku/src'),
        '@game-life/game-klotski': path.resolve(__dirname, '../../games/klotski/src'),
      },
    },
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'axios'],
    },
    server: {
      host: true,
      port: 5173,
      fs: {
        allow: [path.resolve(__dirname, '../..')],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
