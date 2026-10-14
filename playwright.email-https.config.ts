import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["email-media-https.spec.ts"],
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "https://127.0.0.1:3443",
    ignoreHTTPSErrors: true, // Test fixture certificate is not publicly trusted.
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000/api/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "node e2e/https-proxy.mjs",
      url: "https://127.0.0.1:3443/api/health",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
