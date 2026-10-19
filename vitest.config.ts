import { defineConfig } from "vitest/config";

/**
 * Tool packs publish `islands/` and `tools/` as raw source (only `src/` is
 * bundled), so the tests run against exactly the files the tools site composes.
 * Islands opt into jsdom with a `@vitest-environment` docblock.
 *
 * `test-setup.ts` is where an environment shim would go; it holds none since
 * jsdom 30 implements `Blob.arrayBuffer` itself.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "islands/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    restoreMocks: true,
  },
});
