import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("basemap", { recursive: true });
const args = ["extract", "https://build.protomaps.com/20260717.pmtiles", "basemap/greater-melbourne-20260717.pmtiles", "--bbox=143.8,-38.8,146.3,-37.1"];
const result = spawnSync("pmtiles", args, { stdio: "inherit" });
if (result.error?.message.includes("ENOENT")) throw new Error("Install the current PMTiles CLI first: brew install pmtiles");
if (result.status !== 0) process.exit(result.status ?? 1);
