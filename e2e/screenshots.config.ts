import { defineConfig, devices } from "@playwright/test";

// For `pnpm screenshots`, which retakes the README's screenshots. Kept apart
// from the tests' configuration because it asks the real catalogues.
export default defineConfig({
  testDir: "./screenshots",
  reporter: "list",
  timeout: 10 * 60_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 2,
    locale: "en-US",
  },
});
