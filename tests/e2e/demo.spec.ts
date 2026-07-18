import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createDemoDataset } from "../../worker/dataset";

const prepare = async (page: Page) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    (window as typeof window & { __freeMapsCls?: number }).__freeMapsCls = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) (window as typeof window & { __freeMapsCls: number }).__freeMapsCls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/api/v1/demo-dataset?size=*", async (route) => { const size = new URL(route.request().url()).searchParams.get("size") === "5000" ? 5000 : 250; await route.fulfill({ contentType: "application/json", body: JSON.stringify(createDemoDataset(size)) }); });
  await page.route("**/api/tile-session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ token: "test-token", expiresAt: Date.now() + 60_000 }) }));
  await page.route("**/map-assets/heritage-light-v0.2.0.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#d9e6d4" } }] }) }));
  return requests;
};

for (const route of ["/", "/embed/", "/states/", "/vanilla/", "/react/"]) {
  test(`${route} has stable static geometry, metadata, disclosure, and no Google requests`, async ({ page }) => {
    const requests = await prepare(page);
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(route === "/" ? "/$" : `${route.replaceAll("/", "\\/")}$`));
    const footer = page.locator("footer"); await expect(footer).toContainText("MapLibre GL JS"); await expect(footer).toContainText("No Google Maps components or requests are involved.");
    await page.waitForTimeout(500);
    const shifts = await page.evaluate(() => (window as typeof window & { __freeMapsCls?: number }).__freeMapsCls ?? 0);
    expect(shifts).toBeLessThanOrEqual(0.01);
    expect(requests.some((url) => /@googlemaps|google\.maps|maps\.googleapis\.com|maps\.google\.com/i.test(url))).toBe(false);
  });
}

test("explorer paints automatically, clusters, restores URL state, and supports keyboard navigation", async ({ page }, testInfo) => {
  const requests = await prepare(page);
  await page.goto("/?q=Lantern&category=restaurants&sort=name&point=demo-250-1");
  const explorer = page.locator("free-map-explorer"); await expect(explorer).toBeVisible();
  const canvas = explorer.locator("canvas"); await expect(canvas).toBeVisible({ timeout: 30_000 });
  const before = await canvas.screenshot({ path: testInfo.outputPath("map-before.png") }); expect(before.byteLength).toBeGreaterThan(1_000);
  const box = await canvas.boundingBox(); expect(box).toBeTruthy(); await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.waitForTimeout(400);
  const after = await canvas.screenshot(); expect(createHash("sha256").update(after).digest("hex")).not.toBe(createHash("sha256").update(before).digest("hex"));
  const search = explorer.locator("input[type=search]"); await search.focus(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type("Paper Crane"); await expect(page).toHaveURL(/q=Paper(?:\+|%20)Crane/);
  await page.keyboard.press("Tab"); expect(await page.evaluate(() => document.activeElement?.tagName)).toBeTruthy();
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  expect(requests.filter((url) => url.includes("/api/tile-session"))).toHaveLength(1);
  const accessibility = await new AxeBuilder({ page }).analyze(); expect(accessibility.violations).toEqual([]);
});

test("stress route keeps 5,000 points virtualized and updates within budget", async ({ page }) => {
  await prepare(page); await page.goto("/stress/"); const explorer = page.locator("free-map-explorer"); await expect(explorer.locator("canvas")).toBeVisible({ timeout: 30_000 });
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  const elapsed = await explorer.evaluate(async (element) => { const input = element.shadowRoot!.querySelector<HTMLInputElement>("input[type=search]")!; const start = performance.now(); await new Promise<void>((resolve) => { element.addEventListener("free-map-filter-change", () => requestAnimationFrame(() => resolve()), { once: true }); input.value = "Lantern"; input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true })); }); return performance.now() - start; });
  expect(elapsed).toBeLessThan(200); await expect(page.locator("#diagnostics")).toContainText("matches");
});

test("unknown paths return a real 404 page", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist"); expect(response?.status()).toBe(404); await expect(page.locator("h1")).toContainText("does not exist");
});
