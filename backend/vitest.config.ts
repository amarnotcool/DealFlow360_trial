import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests live next to the code they cover. The empty scaffolds under
    // backend/tests/ are not picked up until they are actually written.
    include: ['src/**/*.test.ts'],
  },
});
