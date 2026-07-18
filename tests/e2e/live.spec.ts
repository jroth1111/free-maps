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
  const canvas = explorer.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(explorer.locator(".map-state")).toBeHidden({ timeout: 60_000 });
  await expect(explorer.locator(".maplibregl-ctrl-attrib-inner")).toContainText("Protomaps");
  await expect(explorer.locator(".maplibregl-ctrl-attrib-inner")).toContainText("OpenStreetMap");

  const image = await canvas.screenshot({ path: testInfo.outputPath("deployed-map.png") });
  expect(image.byteLength).toBeGreaterThan(10_000);
  expect(requests.filter((url) => url.includes("/api/tile-session"))).toHaveLength(1);
  expect(tileResponses.some((response) => response.url.endsWith("/tiles/melbourne.json") && response.status === 200)).toBe(true);
  expect(tileResponses.some((response) => response.url.includes(".mvt") && response.status === 200 && response.encoding === "gzip")).toBe(true);
  expect(requests.some((url) => /@googlemaps|google\.maps|maps\.googleapis\.com|maps\.google\.com/i.test(url))).toBe(false);
  expect(consoleErrors).toEqual([]);

  const accessibility = await new AxeBuilder({ page }).include("free-map-explorer").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("deployed-page.png"), fullPage: true });
});
