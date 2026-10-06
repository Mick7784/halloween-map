import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "account-context.spec.ts",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    channel: "chromium",
    baseURL: "http://localhost:3107",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3107",
    url: "http://localhost:3107",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
