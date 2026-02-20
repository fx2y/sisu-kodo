import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    environment: "node",
    passWithNoTests: false,
    pool: "forks",
    hookTimeout: 30000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"]
  },
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "./src")
    }
  }
});
