import { defaultConfig, desktopConfig } from "lighthouse";

const mobile = defaultConfig.settings;
const desktop = desktopConfig.settings;

if (!mobile?.throttling || !mobile.emulatedUserAgent || !desktop?.throttling || !desktop.emulatedUserAgent) {
  throw new Error("Lighthouse 13.4 profile settings are unavailable");
}

const mobileBase = {
  formFactor: "mobile",
  throttling: mobile.throttling,
  emulatedUserAgent: mobile.emulatedUserAgent,
};

export const profiles = {
  mobile: {
    ...mobileBase,
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  },
  ipad: {
    ...mobileBase,
    screenEmulation: { mobile: true, width: 768, height: 1024, deviceScaleFactor: 2, disabled: false },
  },
  desktop: {
    formFactor: "desktop",
    throttling: desktop.throttling,
    emulatedUserAgent: desktop.emulatedUserAgent,
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  },
};

export function validateLighthouseProfiles(candidate = profiles) {
  const failures = [];
  const expected = {
    mobile: { formFactor: "mobile", mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, rttMs: 150, cpuSlowdownMultiplier: 4 },
    ipad: { formFactor: "mobile", mobile: true, width: 768, height: 1024, deviceScaleFactor: 2, rttMs: 150, cpuSlowdownMultiplier: 4 },
    desktop: { formFactor: "desktop", mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, rttMs: 40, cpuSlowdownMultiplier: 1 },
  };

  for (const [name, contract] of Object.entries(expected)) {
    const profile = candidate[name];
    if (!profile) { failures.push(`${name}: missing profile`); continue; }
    for (const key of ["formFactor"]) if (profile[key] !== contract[key]) failures.push(`${name}: ${key} must be ${contract[key]}`);
    for (const key of ["mobile", "width", "height", "deviceScaleFactor"]) if (profile.screenEmulation?.[key] !== contract[key]) failures.push(`${name}: screenEmulation.${key} must be ${contract[key]}`);
    for (const key of ["rttMs", "cpuSlowdownMultiplier"]) if (profile.throttling?.[key] !== contract[key]) failures.push(`${name}: throttling.${key} must be ${contract[key]}`);
    const expectsMobileUa = name !== "desktop";
    if (profile.emulatedUserAgent.includes("Mobile") !== expectsMobileUa) failures.push(`${name}: user agent does not match the profile`);
  }

  if (failures.length) throw new Error(`Invalid Lighthouse profile configuration:\n${failures.join("\n")}`);
}

validateLighthouseProfiles();
