import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createDemoDataset } from "../../worker/dataset";

const prepare = async (page: Page) => {
  const requests: {
    urls: string[];
    authorization: Array<{ url: string; value: string }>;
  } = { urls: [], authorization: [] };
  page.on("pageerror", (error) => console.error(`Browser page error: ${error.stack ?? error.message}`));
  await page.addInitScript(() => {
    const measuredWindow = window as typeof window & { __freeMapsCls?: number; __freeMapsInitialGeometry?: { top: number; width: number; height: number } };
    measuredWindow.__freeMapsCls = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) (window as typeof window & { __freeMapsCls: number }).__freeMapsCls += entry.value; }).observe({ type: "layout-shift", buffered: true });
    document.addEventListener("DOMContentLoaded", () => {
      const target = document.querySelector("free-map-explorer, #react-root");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      measuredWindow.__freeMapsInitialGeometry = { top: rect.top, width: rect.width, height: rect.height };
    }, { once: true });
  });
  page.on("request", (request) => {
    requests.urls.push(request.url());
    const authorization = request.headers().authorization;
    if (authorization) requests.authorization.push({ url: request.url(), value: authorization });
  });
  await page.route("**/api/v1/demo-dataset?size=*", async (route) => { const size = new URL(route.request().url()).searchParams.get("size") === "5000" ? 5000 : 250; await route.fulfill({ contentType: "application/json", body: JSON.stringify(createDemoDataset(size)) }); });
  await page.route("**/api/tile-session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ token: "test-token", expiresAt: Date.now() + 300_000 }) }));
  await page.route("**/map-assets/v0.3.0/atlas-light.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 8, sources: { protomaps: { type: "vector", url: "/tiles/melbourne.json" } }, layers: [{ id: "background", type: "background", paint: { "background-color": "#d9e6d4" } }, { id: "water", type: "fill", source: "protomaps", "source-layer": "water", paint: { "fill-color": "#9ecae1" } }] }) }));
  await page.route("**/tiles/melbourne.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tilejson: "3.0.0", scheme: "xyz", tiles: ["/tiles/test/{z}/{x}/{y}.mvt"], minzoom: 0, maxzoom: 15, bounds: [143.8, -38.8, 146.3, -37.1] }) }));
  await page.route(/\/tiles\/test\/\d+\/\d+\/\d+\.mvt/, (route) => route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: Buffer.alloc(0) }));
  return requests;
};

for (const route of ["/", "/embed/", "/states/", "/vanilla/", "/react/"]) {
  test(`${route} has stable static geometry, metadata, disclosure, and no Google requests`, async ({ page }) => {
    const requests = await prepare(page);
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(route === "/" ? "/$" : `${route.replaceAll("/", "\\/")}$`));
    const footer = page.locator("footer"); await expect(footer).toContainText("Free Maps vector canvas"); await expect(footer).toContainText("MapLibre adapter available"); await expect(footer).toContainText("No Google Maps components or requests are involved.");
    await page.waitForTimeout(500);
    const geometry = await page.evaluate(() => {
      const measuredWindow = window as typeof window & { __freeMapsCls?: number; __freeMapsInitialGeometry?: { top: number; width: number; height: number } };
      const target = document.querySelector("free-map-explorer, #react-root")!;
      const rect = target.getBoundingClientRect();
      return { shifts: measuredWindow.__freeMapsCls ?? 0, initial: measuredWindow.__freeMapsInitialGeometry, current: { top: rect.top, width: rect.width, height: rect.height } };
    });
    expect(geometry.shifts).toBeLessThanOrEqual(0.01);
    expect(geometry.initial).toBeTruthy();
    expect(Math.abs(geometry.current.top - geometry.initial!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.current.width - geometry.initial!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.current.height - geometry.initial!.height)).toBeLessThanOrEqual(1);
    expect(requests.urls.some((url) => /@googlemaps|google\.maps|maps\.googleapis\.com|maps\.google\.com|static\.cloudflareinsights\.com|\/cdn-cgi\/rum/i.test(url))).toBe(false);
    if (route !== "/react/") expect(requests.urls.some((url) => /\/assets\/react-[^/]+\.js/.test(url))).toBe(false);
    const accessibility = await new AxeBuilder({ page }).analyze(); expect(accessibility.violations).toEqual([]);
  });
}

for (const route of ["/embed/", "/vanilla/", "/react/"]) {
  test(`${route} activates a real vector-tile canvas automatically`, async ({ page }) => {
    const requests = await prepare(page); await page.goto(route);
    const canvas = page.locator("free-map-explorer canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-tiles-painted", "true");
    if (route === "/embed/") {
      const tileJsonRequests = () => requests.authorization.filter(({ url }) => new URL(url).pathname === "/tiles/melbourne.json").length;
      await expect.poll(tileJsonRequests).toBe(1);
      const surface = page.locator("free-map-surface");
      await surface.scrollIntoViewIfNeeded();
      await expect(surface.locator("canvas")).toBeVisible({ timeout: 30_000 });
      await expect.poll(tileJsonRequests).toBe(2);
    }
  });
}

test("explorer paints automatically, clusters, restores URL state, and supports keyboard navigation", async ({ page }, testInfo) => {
  const requests = await prepare(page);
  await page.goto("/?q=Lantern&category=japanese&sort=name&point=demo-250-1");
  const explorer = page.locator("free-map-explorer"); await expect(explorer).toBeVisible();
  const canvas = explorer.locator("canvas"); await expect(canvas).toBeVisible({ timeout: 30_000 });
  const before = await canvas.screenshot({ path: testInfo.outputPath("map-before.png") }); expect(before.byteLength).toBeGreaterThan(1_000);
  const box = await canvas.boundingBox(); expect(box).toBeTruthy(); await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.waitForTimeout(400);
  const after = await canvas.screenshot(); expect(createHash("sha256").update(after).digest("hex")).not.toBe(createHash("sha256").update(before).digest("hex"));
  const initialPoint = await explorer.evaluate((element) => (element as HTMLElement & { selectedId: string | null }).selectedId);
  const keyboardResult = explorer.locator(".row button").nth(1); await keyboardResult.focus(); await page.keyboard.press("Enter");
  const keyboardPoint = await explorer.evaluate((element) => (element as HTMLElement & { selectedId: string | null }).selectedId);
  expect(keyboardPoint).toBeTruthy(); expect(keyboardPoint).not.toBe(initialPoint); await expect(page).toHaveURL(new RegExp(`point=${keyboardPoint}`));
  await page.goBack(); await expect.poll(() => explorer.evaluate((element) => (element as HTMLElement & { selectedId: string | null }).selectedId)).toBe(initialPoint);
  const search = explorer.locator("input[type=search]"); await search.focus(); await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.type("Paper Crane"); await expect(page).toHaveURL(/q=Paper(?:\+|%20)Crane/);
  await page.keyboard.press("Tab"); expect(await explorer.evaluate((element) => element.shadowRoot?.activeElement?.getAttribute("part"))).toBe("category-select");
  await page.keyboard.press("Tab"); expect(await explorer.evaluate((element) => element.shadowRoot?.activeElement?.getAttribute("part"))).toBe("sort-select");
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  expect(requests.urls.filter((url) => url.includes("/api/tile-session"))).toHaveLength(1);
  expect(requests.authorization.length).toBeGreaterThan(0);
  expect(requests.authorization.every(({ url, value }) => new URL(url).pathname.startsWith("/tiles/") && value === "Bearer test-token")).toBe(true);
  expect(requests.urls.some((url) => new URL(url).searchParams.has("token"))).toBe(false);
  const timing = await page.evaluate(() => {
    const stable = Number(document.documentElement.dataset.stablePaint);
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    return { stable, mapStarts: resources.filter((entry) => /vector|tile-session|\/tiles\//i.test(entry.name)).map((entry) => entry.startTime), mapLibre: resources.filter((entry) => /maplibre/i.test(entry.name)).map((entry) => entry.name) };
  });
  expect(timing.stable).toBeGreaterThan(0);
  expect(timing.mapStarts.every((start) => start >= timing.stable)).toBe(true);
  expect(timing.mapLibre).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).analyze(); expect(accessibility.violations).toEqual([]);
});

test("Atlas themes and consumer token overrides are applied before activation", async ({ page }) => {
  await prepare(page); await page.goto("/states/");
  const light = page.locator("#theme"); const dark = page.locator("#theme-dark");
  await expect(light).toHaveClass(/free-map-theme-atlas/); await expect(dark).toHaveClass(/free-map-theme-atlas-dark/);
  const readTokens = () => page.evaluate(() => {
    const read = (selector: string, token: string) => getComputedStyle(document.querySelector(selector)!).getPropertyValue(token).trim();
    return { light: read("#theme", "--free-map-marker-selected"), dark: read("#theme-dark", "--free-map-marker-selected") };
  });
  await expect.poll(readTokens).toEqual({ light: "#8b2635", dark: "#f09aaa" });
  const tokens = await readTokens();
  expect(tokens.light).toBe("#8b2635"); expect(tokens.dark).toBe("#f09aaa");
  await light.evaluate((element) => element.setAttribute("style", "--free-map-accent: #005fcc"));
  expect(await light.evaluate((element) => getComputedStyle(element).getPropertyValue("--free-map-accent").trim())).toBe("#005fcc");
  await light.scrollIntoViewIfNeeded();
  await expect(light.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await dark.scrollIntoViewIfNeeded();
  await expect(dark.locator("canvas")).toBeVisible({ timeout: 30_000 });
});

test("stress route keeps 5,000 points virtualized and updates within budget", async ({ page }) => {
  await prepare(page); await page.goto("/stress/"); const explorer = page.locator("free-map-explorer"); await expect(explorer.locator("canvas")).toBeVisible({ timeout: 30_000 });
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  const samples = await explorer.evaluate(async (element) => {
    const input = element.shadowRoot!.querySelector<HTMLInputElement>("input[type=search]")!;
    const timings: number[] = [];
    for (let run = 0; run < 30; run++) {
      const start = performance.now();
      performance.clearMarks("free-maps:renderer-update");
      input.value = run % 2 ? `Lantern ${run}` : "Lantern";
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          const update = performance.getEntriesByName("free-maps:renderer-update", "mark").at(-1);
          if (update && update.startTime >= start) { resolve(); return; }
          if (performance.now() - start > 2_000) { reject(new Error("renderer update mark timed out")); return; }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
      timings.push(performance.now() - start);
    }
    return timings.sort((left, right) => left - right);
  });
  expect(samples[Math.floor(samples.length * .95)]).toBeLessThan(200);
  await expect(page.locator("#diagnostics")).toContainText("matches");
});

test("unknown paths return a real 404 page", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist"); expect(response?.status()).toBe(404); await expect(page.locator("h1")).toContainText("does not exist");
});
