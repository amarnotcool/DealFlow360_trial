import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests live next to the code they cover, plus the named scaffolds under
    // backend/tests/ that have actually been written. The remaining empty
    // scaffolds are listed as they are filled in.
    include: ['src/**/*.test.ts', 'tests/fulfillment-split.test.ts'],
  },
});
