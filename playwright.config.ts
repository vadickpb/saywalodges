import { defineConfig, devices } from "@playwright/test";
import { bookingAppEnv } from "./scripts/booking-e2e-env.mjs";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  globalTimeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://saywa-lodges.localhost:3410",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3410",
    url: "http://localhost:3410",
    reuseExistingServer: false,
    timeout: 30_000,
    env: bookingAppEnv(),
  },
});
