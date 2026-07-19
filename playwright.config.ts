import { defineConfig } from "@playwright/test";

const liveBaseURL = process.env.LIVE_BASE_URL;
const baseURL = liveBaseURL ?? "http://127.0.0.1:4173";
const workerVersionOverrideId = process.env.WORKER_VERSION_OVERRIDE_ID;
const extraHTTPHeaders = workerVersionOverrideId
  ? { "Cloudflare-Workers-Version-Overrides": `free-maps="${workerVersionOverrideId}"` }
  : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL, extraHTTPHeaders, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "mobile-412", use: { browserName: "chromium", viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true } },
    { name: "ipad-768", use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "desktop-1350", use: { browserName: "chromium", viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1 } },
  ],
  webServer: liveBaseURL ? undefined : { command: "npm run preview:test", url: "http://127.0.0.1:4173", reuseExistingServer: false, timeout: 120_000 },
});
