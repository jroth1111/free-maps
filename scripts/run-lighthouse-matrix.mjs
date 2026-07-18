import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const baseUrl = process.env.LIGHTHOUSE_BASE_URL ?? process.env.LIVE_BASE_URL;
if (!baseUrl) throw new Error("Set LIGHTHOUSE_BASE_URL to the deployed origin");
const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error("Set CHROME_PATH to Chrome for Testing 151.0.7922.34");
const routes = (process.env.LIGHTHOUSE_ROUTES ?? "/,/embed/,/states/,/vanilla/,/react/").split(",");
const runs = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const outputDir = resolve(process.env.LIGHTHOUSE_OUTPUT_DIR ?? "artifacts/lighthouse");
rmSync(outputDir, { recursive: true, force: true }); mkdirSync(outputDir, { recursive: true });
const profiles = {
  mobile: { formFactor: "mobile", screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false } },
  ipad: { formFactor: "mobile", screenEmulation: { mobile: true, width: 768, height: 1024, deviceScaleFactor: 2, disabled: false } },
  desktop: { formFactor: "desktop", preset: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } },
};
const selectedProfiles = (process.env.LIGHTHOUSE_PROFILES ?? Object.keys(profiles).join(",")).split(",");
const categories = ["performance", "accessibility", "best-practices", "seo", "agentic-browsing"];
const rows = [];
for (const route of routes) for (const profile of selectedProfiles) for (let run = 1; run <= runs; run++) {
  const settings = profiles[profile]; if (!settings) throw new Error(`Unknown Lighthouse profile ${profile}`);
  const slug = route === "/" ? "index" : route.replaceAll("/", "");
  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const result = await lighthouse(new URL(route, baseUrl).href, { port: chrome.port, output: ["json", "html"], logLevel: "error", onlyCategories: categories, throttlingMethod: "simulate", ...settings });
    if (!result) throw new Error(`Lighthouse returned no result for ${route} ${profile} run ${run}`);
    const reports = Array.isArray(result.report) ? result.report : [result.report];
    const stem = resolve(outputDir, `${slug}-${profile}-${run}`);
    writeFileSync(`${stem}.json`, reports[0]); writeFileSync(`${stem}.html`, reports[1]);
    const scores = Object.fromEntries(categories.map((id) => [id, result.lhr.categories[id]?.score ?? 0]));
    rows.push({ route, profile, run, scores });
    console.log(`${route} ${profile} ${run}: ${categories.map((id) => `${id}=${Math.round(scores[id] * 100)}`).join(" ")}`);
  } finally { await chrome.kill(); }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const matrix = [];
for (const route of routes) for (const profile of selectedProfiles) {
  const selected = rows.filter((row) => row.route === route && row.profile === profile);
  const medians = Object.fromEntries(categories.map((id) => [id, median(selected.map((row) => row.scores[id]))]));
  const minimumPerformance = Math.min(...selected.map((row) => row.scores.performance));
  matrix.push({ route, profile, medians, minimumPerformance });
}
const failures = [];
for (const row of matrix) {
  if (row.medians.performance < .95) failures.push(`${row.route} ${row.profile}: median performance ${row.medians.performance}`);
  if (row.minimumPerformance < .90) failures.push(`${row.route} ${row.profile}: minimum performance ${row.minimumPerformance}`);
  for (const id of categories.slice(1)) if (row.medians[id] !== 1) failures.push(`${row.route} ${row.profile}: median ${id} ${row.medians[id]}`);
}
writeFileSync(resolve(outputDir, "score-matrix.json"), `${JSON.stringify({ chromeVersion: "151.0.7922.34", lighthouseVersion: "13.4.0", rows, matrix, failures }, null, 2)}\n`);
writeFileSync(resolve(outputDir, "score-matrix.md"), `# Lighthouse score matrix\n\nChrome for Testing 151.0.7922.34; Lighthouse 13.4.0; cold profiles; simulated throttling.\n\n| Route | Profile | Performance median | Performance minimum | Accessibility | Best Practices | SEO | Agentic Browsing |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${matrix.map((row) => `| ${row.route} | ${row.profile} | ${Math.round(row.medians.performance * 100)} | ${Math.round(row.minimumPerformance * 100)} | ${Math.round(row.medians.accessibility * 100)} | ${Math.round(row.medians["best-practices"] * 100)} | ${Math.round(row.medians.seo * 100)} | ${Math.round(row.medians["agentic-browsing"] * 100)} |`).join("\n")}\n`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
