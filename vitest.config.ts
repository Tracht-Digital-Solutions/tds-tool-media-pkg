import { defineConfig } from "vitest/config";

/**
 * Tool packs publish `islands/` and `tools/` as raw source (only `src/` is
 * bundled), so the tests run against exactly the files the tools site composes.
 * Islands opt into jsdom with a `@vitest-environment` docblock.
 *
 * `test-setup.ts` shims `Blob.arrayBuffer`, which jsdom lacks and which both
 * islands need in order to read the user's file.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "islands/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    restoreMocks: true,
  },
});
