import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_ORIGIN ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/ors-fixture.mjs",
      url: "http://127.0.0.1:3106/health",
      reuseExistingServer: false,
    },
    {
      command: "node node_modules/next/dist/bin/next start",
      env: { ORS_BASE_URL: "http://127.0.0.1:3106", ORS_API_KEY: "" },
      url: "http://localhost:3000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
