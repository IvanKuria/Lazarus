import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Build a hermetic localhost bundle before tests (overrides .env.production).
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
});
