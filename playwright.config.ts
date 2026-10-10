import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const testMail = {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "3107",
  SMTP_SECURE: "true",
  SMTP_FROM: "fixture@example.invalid",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_REPLY_TO: "",
  NODE_EXTRA_CA_CERTS: resolve("e2e/fixtures/localhost-cert.pem"),
};
Object.assign(process.env, testMail);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_ORIGIN ?? "http://localhost:3000",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            args: [
              "--no-sandbox",
              "--disable-dev-shm-usage",
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
            ],
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/integration-provider.mjs",
      url: "http://127.0.0.1:3108/health",
      reuseExistingServer: false,
    },
    {
      command: "node e2e/ors-fixture.mjs",
      url: "http://127.0.0.1:3106/health",
      reuseExistingServer: false,
    },
    {
      command:
        "node --import ./e2e/test-provider-preload.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1",
      env: {
        ...testMail,
        ORS_BASE_URL: "http://127.0.0.1:3106",
        ORS_API_KEY: "",
      },
      url: (process.env.APP_ORIGIN ?? "http://127.0.0.1:3000") + "/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
