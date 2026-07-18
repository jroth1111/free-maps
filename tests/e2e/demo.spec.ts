import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createDemoDataset } from "../../worker/dataset";

const prepare = async (page: Page) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/api/v1/demo-dataset?size=*", async (route) => {
    const size = new URL(route.request().url()).searchParams.get("size") === "5000" ? 5000 : 250;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(createDemoDataset(size)) });
  });
  return requests;
};

test("full explorer paints, clusters, supports keyboard/deep links, and makes no forbidden requests", async ({ page }, testInfo) => {
  const requests = await prepare(page);
  await page.goto("/?view=full&test=1&point=demo-250-1");
  const explorer = page.locator("free-map-explorer");
  await expect(explorer).toBeVisible();
  await expect(explorer.locator(".details h2")).toContainText("Lantern 001");
  const canvas = explorer.locator("canvas");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot({ path: testInfo.outputPath("map-before.png") });
  expect(before.byteLength).toBeGreaterThan(1_000);
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(600);
  const after = await canvas.screenshot({ path: testInfo.outputPath("map-after.png") });
  expect(createHash("sha256").update(after).digest("hex")).not.toBe(createHash("sha256").update(before).digest("hex"));
  const search = explorer.locator("input[type=search]");
  await search.focus(); await page.keyboard.type("Paper Crane");
  await expect(explorer.locator("button", { hasText: "Show all 25 pins" })).toBeVisible();
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  const accessibility = await new AxeBuilder({ page }).include("free-map-explorer").analyze();
  expect(accessibility.violations).toEqual([]);
  expect(requests.some((url) => /google/i.test(url))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("full-explorer.png"), fullPage: true });
});

test("selection participates in browser history and mobile details stay in flow", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/?view=full&test=1");
  const explorer = page.locator("free-map-explorer");
  await expect(explorer.locator(".row").first()).toBeVisible();
  await explorer.locator(".row button").first().click();
  await expect(page).toHaveURL(/point=demo-250-/);
  await expect(explorer.locator(".details")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/point=/);
  await expect(explorer.locator(".details")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("mobile-flow.png"), fullPage: true });
});

test("5k explorer stays virtualized and responds inside the documented budgets", async ({ page }, testInfo) => {
  await prepare(page);
  await page.goto("/?view=stress&test=1");
  const explorer = page.locator("free-map-explorer");
  await expect(explorer.locator("canvas")).toBeVisible();
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  const started = Date.now();
  await explorer.locator("input[type=search]").fill("Lantern");
  await expect(page.locator("#diagnostics")).toContainText("matches");
  expect(Date.now() - started).toBeLessThan(200);
  expect(await explorer.locator(".row").count()).toBeLessThan(60);
  await page.screenshot({ path: testInfo.outputPath("stress.png"), fullPage: true });
});
