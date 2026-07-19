import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const liveBaseURL = process.env.LIVE_BASE_URL;

test.skip(!liveBaseURL, "Set LIVE_BASE_URL to run deployed smoke checks");

test("deployed explorer paints protected PMTiles with no forbidden requests", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  const tileResponses: Array<{ url: string; status: number; encoding?: string }> = [];
  const consoleErrors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("response", async (response) => {
    if (response.url().includes("/tiles/")) {
      const headers = await response.allHeaders();
      tileResponses.push({ url: response.url(), status: response.status(), encoding: headers["content-encoding"] });
    }
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto(`${liveBaseURL}/`, { waitUntil: "networkidle" });
  const explorer = page.locator("free-map-explorer");
  await expect(explorer).toBeVisible();
  await page.evaluate(() => customElements.whenDefined("free-map-explorer"));
  await explorer.evaluate((element) => (element as HTMLElement & { activate(): Promise<void> }).activate());
  const canvas = explorer.locator(".free-map-vector-canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute("data-tiles-painted", "true", { timeout: 60_000 });
  await expect(explorer.locator(".map-state")).toBeHidden({ timeout: 60_000 });
  await expect(explorer.getByText("Protomaps", { exact: true })).toBeVisible();
  await expect(explorer.getByText("© OpenStreetMap", { exact: true })).toBeVisible();

  const image = await explorer.locator(".map").screenshot({ path: testInfo.outputPath("deployed-map.png") });
  expect(image.byteLength).toBeGreaterThan(10_000);
  expect(requests.filter((url) => url.includes("/api/tile-session"))).toHaveLength(1);
  expect(tileResponses.some((response) => response.url.endsWith("/tiles/melbourne.json") && response.status === 200)).toBe(true);
  expect(tileResponses.some((response) => response.url.includes(".mvt") && response.status === 200 && response.encoding === "gzip")).toBe(true);
  expect(requests.some((url) => /@googlemaps|google\.maps|maps\.googleapis\.com|maps\.google\.com|static\.cloudflareinsights\.com|\/cdn-cgi\/rum/i.test(url))).toBe(false);
  const transientTileFailures = tileResponses.filter(({ url, status }) => url.includes(".mvt") && (status === 429 || status >= 500));
  const recoveredTileFailures = transientTileFailures.filter(({ url }) => tileResponses.some((response) => response.url === url && response.status === 200));
  expect(recoveredTileFailures).toHaveLength(transientTileFailures.length);
  const resourceErrors = consoleErrors.filter((message) => /^Failed to load resource: the server responded with a status of (?:429|5\d\d)/.test(message));
  expect(resourceErrors.length).toBeLessThanOrEqual(recoveredTileFailures.length);
  expect(consoleErrors.filter((message) => !resourceErrors.includes(message))).toEqual([]);

  const accessibility = await new AxeBuilder({ page }).include("free-map-explorer").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("deployed-page.png"), fullPage: true });
});
