import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['@rsc-gl/source'] },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environment: 'node',
  },
});
