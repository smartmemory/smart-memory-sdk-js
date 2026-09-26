import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.js'),
        apiBaseUrl: resolve(__dirname, 'src/apiBaseUrl.js'),
        core: resolve(__dirname, 'src/core.js'),
        react: resolve(__dirname, 'src/react/index.js'),
        'react/analytics': resolve(__dirname, 'src/react/analytics/index.js'),
        fetch: resolve(__dirname, 'src/fetch/index.js'),
        connection: resolve(__dirname, 'src/connection/index.js'),
        progress: resolve(__dirname, 'src/progress.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: ['posthog-js', 'react', 'react-dom']
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/types/**']
    }
  }
});
