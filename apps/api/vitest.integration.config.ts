import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.integration.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/load-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
