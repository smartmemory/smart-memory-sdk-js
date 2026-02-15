import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.js'),
        core: resolve(__dirname, 'src/core.js'),
        react: resolve(__dirname, 'src/react/index.js'),
        fetch: resolve(__dirname, 'src/fetch/index.js')
      },
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom']
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
