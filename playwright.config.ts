import { defineConfig, devices } from "@playwright/test";

const liveBaseURL = process.env.LIVE_BASE_URL;
const baseURL = liveBaseURL ?? "http://127.0.0.1:4173";
const workerVersionOverrideId = process.env.WORKER_VERSION_OVERRIDE_ID;
const extraHTTPHeaders = workerVersionOverrideId
  ? { "Cloudflare-Workers-Version-Overrides": `free-maps="${workerVersionOverrideId}"` }
  : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL, extraHTTPHeaders, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: liveBaseURL ? undefined : { command: "npm run preview:test", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 120_000 },
});
