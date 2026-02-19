import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    environment: "node",
    passWithNoTests: false,
    pool: "forks"
  }
});
