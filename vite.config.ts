import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// Каркас: одна тяжёлая runtime-зависимость (pixi.js) изолирована в src/render/pixi,
// поэтому её удобно вынести в отдельный чанк и грузить лениво вместе со сценой.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
        },
      },
      plugins: [
        visualizer({
          filename: 'dist/report/bundle-report.html',
          gzipSize: true,
          brotliSize: true,
        }),
      ],
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
  },
});
