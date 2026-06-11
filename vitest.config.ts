import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-logic modules only; anything importing react-native is untestable
    // in node and belongs behind the interfaces in src/lib.
    include: ['src/lib/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
