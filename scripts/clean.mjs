import { rmSync } from "node:fs";

for (const path of ["dist", "demo-dist"]) rmSync(new URL(`../${path}`, import.meta.url), { recursive: true, force: true });
