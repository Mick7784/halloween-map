import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "map-orientation-v093.spec.ts", workers: 1, timeout: 30000,
  reporter: "list", use: { baseURL: "http://localhost:3105", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "node node_modules/next/dist/bin/next start -p 3105", url: "http://localhost:3105", reuseExistingServer: false, timeout: 60000 },
});
