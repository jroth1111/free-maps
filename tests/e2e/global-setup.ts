import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const routes = ["/", "/embed/", "/states/", "/vanilla/", "/react/"] as const;
const routeFile = (route: (typeof routes)[number]) => resolve("demo-dist", route === "/" ? "index.html" : `${route.slice(1)}index.html`);
const wait = (milliseconds: number) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

export default async function waitForVersionOverride(): Promise<void> {
  const baseUrl = process.env.LIVE_BASE_URL;
  const version = process.env.WORKER_VERSION_OVERRIDE_ID;
  if (!baseUrl || !version) return;

  const missing = routes.map(routeFile).filter((file) => !existsSync(file));
  if (missing.length) throw new Error(`Build the demo before deployed version verification; missing ${missing.join(", ")}`);
  const expected = new Map(routes.map((route) => [route, readFileSync(routeFile(route), "utf8")]));
  const headers = { "Cloudflare-Workers-Version-Overrides": `free-maps="${version}"`, "Cache-Control": "no-cache" };
  let consecutiveReadyRounds = 0;
  let lastFailure = "candidate did not respond";

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const healthResponse = await fetch(new URL("/api/health", baseUrl), { headers });
      const health = await healthResponse.json() as { deployment?: string };
      if (!healthResponse.ok || health.deployment !== version) {
        lastFailure = `health selected ${health.deployment ?? healthResponse.status} instead of ${version}`;
        consecutiveReadyRounds = 0;
      } else {
        const responses = await Promise.all(routes.map(async (route) => {
          const response = await fetch(new URL(route, baseUrl), { headers });
          return { route, ok: response.ok, body: await response.text() };
        }));
        const mismatches = responses.filter(({ route, ok, body }) => !ok || body !== expected.get(route)).map(({ route }) => route);
        if (mismatches.length) {
          lastFailure = `static HTML did not match the selected build for ${mismatches.join(", ")}`;
          consecutiveReadyRounds = 0;
        } else if (++consecutiveReadyRounds === 10) return;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      consecutiveReadyRounds = 0;
    }
    await wait(1_000);
  }

  throw new Error(`Version override ${version} did not become coherent: ${lastFailure}`);
}
