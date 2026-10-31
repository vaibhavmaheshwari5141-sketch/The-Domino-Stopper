import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: loadEnv('test', process.cwd(), ''),     // .env values (LOCAL_DATA_DIR, ...) for the real-data tests
    testTimeout: 30_000,
  },
});
