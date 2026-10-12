import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "account-context.spec.ts",
    "home-reference.spec.ts",
    "participation-context.spec.ts",
    "routing-v05.spec.ts",
    "floating-navigation.spec.ts",
    "admin-shell.spec.ts",
    "global-account-v087.spec.ts",
    "compact-menu-v088.spec.ts",
  ],
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3110",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -p 3110",
    url: "http://localhost:3110",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
