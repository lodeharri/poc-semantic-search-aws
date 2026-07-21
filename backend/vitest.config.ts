import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Infrastructure adapters are Tier 2 (integration tests with real Neon/Gemini)
        'src/infrastructure/db/schema/**',
        'src/infrastructure/db/repositories/**',
        'src/infrastructure/llm/**',
        'src/infrastructure/config/**',
        // Lambda entry point is tested via handler tests
        'src/lambda.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        // Tier 1 covers domain + application layers — those must be well covered.
        // Infrastructure adapters are excluded (Tier 2 integration tests).
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
