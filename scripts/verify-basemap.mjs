import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";

const path = "basemap/greater-melbourne-20260717.pmtiles";
const size = statSync(path).size;
if (size >= 315_000_000) throw new Error(`Archive ${size} bytes exceeds Wrangler's documented 315 MB limit`);
const hash = createHash("sha256");
for await (const chunk of createReadStream(path)) hash.update(chunk);
console.log(JSON.stringify({ path, size, sha256: hash.digest("hex") }, null, 2));
