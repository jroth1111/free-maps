import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { profiles } from "./lighthouse-profiles.mjs";

const baseUrl = process.env.LIGHTHOUSE_BASE_URL ?? process.env.LIVE_BASE_URL;
if (!baseUrl) throw new Error("Set LIGHTHOUSE_BASE_URL to the deployed origin");
const workerVersionOverrideId = process.env.WORKER_VERSION_OVERRIDE_ID;
const extraHeaders = workerVersionOverrideId
  ? { "Cloudflare-Workers-Version-Overrides": `free-maps="${workerVersionOverrideId}"`, "Cache-Control": "no-cache" }
  : undefined;
const chromePath = process.env.CHROME_PATH;
if (!chromePath) throw new Error("Set CHROME_PATH to Chrome for Testing 151.0.7922.34");
const routes = (process.env.LIGHTHOUSE_ROUTES ?? "/,/embed/,/states/,/vanilla/,/react/").split(",");
const runs = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const modes = (process.env.LIGHTHOUSE_MODES ?? "cold,warm").split(",");
const outputDir = resolve(process.env.LIGHTHOUSE_OUTPUT_DIR ?? "artifacts/lighthouse-v0.3.0");
const baselinePath = resolve(process.env.LIGHTHOUSE_BASELINE ?? "docs/lighthouse-accepted-baseline.json");
rmSync(outputDir, { recursive: true, force: true }); mkdirSync(outputDir, { recursive: true });
const selectedProfiles = (process.env.LIGHTHOUSE_PROFILES ?? Object.keys(profiles).join(",")).split(",");
const categories = ["performance", "accessibility", "best-practices", "seo", "agentic-browsing"];
const rows = [];

const flagsFor = (port, settings, output, disableStorageReset = false) => ({ port, output, logLevel: "error", onlyCategories: categories, throttlingMethod: "simulate", disableStorageReset, extraHeaders, ...settings });

for (const mode of modes) for (const route of routes) for (const profile of selectedProfiles) for (let run = 1; run <= runs; run++) {
  if (mode !== "cold" && mode !== "warm") throw new Error(`Unknown Lighthouse mode ${mode}`);
  const settings = profiles[profile]; if (!settings) throw new Error(`Unknown Lighthouse profile ${profile}`);
  const slug = route === "/" ? "index" : route.replaceAll("/", "");
  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const target = new URL(route, baseUrl).href;
    if (mode === "warm") {
      const primed = await lighthouse(target, flagsFor(chrome.port, settings, "json", false));
      if (!primed) throw new Error(`Lighthouse priming returned no result for ${route} ${profile} run ${run}`);
    }
    const result = await lighthouse(target, flagsFor(chrome.port, settings, ["json", "html"], mode === "warm"));
    if (!result) throw new Error(`Lighthouse returned no result for ${mode} ${route} ${profile} run ${run}`);
    const reports = Array.isArray(result.report) ? result.report : [result.report];
    const stem = resolve(outputDir, `${mode}-${slug}-${profile}-${run}`);
    writeFileSync(`${stem}.json`, reports[0]); writeFileSync(`${stem}.html`, reports[1]);
    const scores = Object.fromEntries(categories.map((id) => [id, result.lhr.categories[id]?.score ?? 0]));
    rows.push({ mode, route, profile, run, scores });
    console.log(`${mode} ${route} ${profile} ${run}: ${categories.map((id) => `${id}=${Math.round(scores[id] * 100)}`).join(" ")}`);
  } finally {
    try { await chrome.kill(); }
    catch (error) { console.warn(`Chrome cleanup warning after completed report: ${error instanceof Error ? error.message : String(error)}`); }
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const matrices = {};
for (const mode of modes) {
  const matrix = [];
  for (const route of routes) for (const profile of selectedProfiles) {
    const selected = rows.filter((row) => row.mode === mode && row.route === route && row.profile === profile);
    const medians = Object.fromEntries(categories.map((id) => [id, median(selected.map((row) => row.scores[id]))]));
    const minimumPerformance = Math.min(...selected.map((row) => row.scores.performance));
    matrix.push({ route, profile, medians, minimumPerformance });
  }
  matrices[mode] = matrix;
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const failures = [];
for (const [mode, matrix] of Object.entries(matrices)) for (const row of matrix) {
  if (row.minimumPerformance < .96) failures.push(`${mode} ${row.route} ${row.profile}: minimum performance ${row.minimumPerformance}`);
  if (row.medians.performance !== 1) failures.push(`${mode} ${row.route} ${row.profile}: median performance must be 1`);
  for (const measured of rows.filter((candidate) => candidate.mode === mode && candidate.route === row.route && candidate.profile === row.profile)) for (const id of categories.slice(1)) if (measured.scores[id] !== 1) failures.push(`${mode} ${row.route} ${row.profile} run ${measured.run}: ${id} must be 1`);
  const accepted = baseline.matrix.find((entry) => entry.route === row.route && entry.profile === row.profile);
  if (!accepted) failures.push(`Missing accepted baseline for ${row.route} ${row.profile}`);
  else for (const id of categories) if (row.medians[id] < accepted.medians[id]) failures.push(`${mode} ${row.route} ${row.profile}: ${id} regressed below accepted baseline`);
}

const result = { chromeVersion: "151.0.7922.34", lighthouseVersion: "13.4.0", workerVersionOverrideId: workerVersionOverrideId ?? null, effectiveProfiles: Object.fromEntries(selectedProfiles.map((profile) => [profile, profiles[profile]])), expectedReports: routes.length * selectedProfiles.length * modes.length * runs, rows, matrices, baseline: baselinePath, failures };
if (rows.length !== result.expectedReports) failures.push(`Expected ${result.expectedReports} measured reports, received ${rows.length}`);
writeFileSync(resolve(outputDir, "score-matrix.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const [mode, matrix] of Object.entries(matrices)) {
  writeFileSync(resolve(outputDir, `score-matrix-${mode}.md`), `# Lighthouse ${mode} score matrix\n\nChrome for Testing 151.0.7922.34; Lighthouse 13.4.0; ${mode} profiles; simulated throttling.\n\n| Route | Profile | Performance median | Performance minimum | Accessibility | Best Practices | SEO | Agentic Browsing |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${matrix.map((row) => `| ${row.route} | ${row.profile} | ${Math.round(row.medians.performance * 100)} | ${Math.round(row.minimumPerformance * 100)} | ${Math.round(row.medians.accessibility * 100)} | ${Math.round(row.medians["best-practices"] * 100)} | ${Math.round(row.medians.seo * 100)} | ${Math.round(row.medians["agentic-browsing"] * 100)} |`).join("\n")}\n`);
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
