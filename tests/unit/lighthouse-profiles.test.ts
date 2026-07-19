import { describe, expect, it } from "vitest";

// The Lighthouse runner is intentionally plain ESM so it can execute without
// a TypeScript loader in release environments.
// @ts-expect-error runtime-only JavaScript module
import { profiles, validateLighthouseProfiles } from "../../scripts/lighthouse-profiles.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Lighthouse profiles", () => {
  it("pins the effective mobile, iPad, and desktop settings", () => {
    expect(() => validateLighthouseProfiles()).not.toThrow();
    expect(profiles.desktop).toMatchObject({
      formFactor: "desktop",
      throttling: { rttMs: 40, cpuSlowdownMultiplier: 1 },
      screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
    });
    expect(profiles.desktop.emulatedUserAgent).not.toContain("Mobile");
    expect(profiles.mobile.throttling).toMatchObject({ rttMs: 150, cpuSlowdownMultiplier: 4 });
    expect(profiles.ipad.screenEmulation).toMatchObject({ mobile: true, width: 768, height: 1024, deviceScaleFactor: 2 });
  });

  it("rejects a desktop label backed by mobile throttling", () => {
    const invalid = structuredClone(profiles);
    invalid.desktop.throttling = profiles.mobile.throttling;
    invalid.desktop.emulatedUserAgent = profiles.mobile.emulatedUserAgent;
    expect(() => validateLighthouseProfiles(invalid)).toThrow(/desktop: throttling\.rttMs must be 40/);
    expect(() => validateLighthouseProfiles(invalid)).toThrow(/desktop: user agent does not match/);
  });

  it("bypasses stale outer HTML cache entries during version-override audits", () => {
    const runner = readFileSync(resolve("scripts/run-lighthouse-matrix.mjs"), "utf8");
    expect(runner).toContain('"Cache-Control": "no-cache"');
  });
});
