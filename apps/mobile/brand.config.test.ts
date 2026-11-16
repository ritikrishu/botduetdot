import type { ExpoConfig } from "expo/config";
import { expect, it } from "vite-plus/test";
import { applyMobileBrand } from "./brand.config";
const env = {
  T3CODE_BRAND: "standalone",
  EXPO_PUBLIC_T3CODE_BRAND: "standalone",
  T3CODE_MOBILE_VERSION: "0.1.9-botduetdot.1",
  T3CODE_ANDROID_VERSION_CODE: "2026111601",
};
function fixture(): ExpoConfig {
  return {
    name: "T3 Code",
    slug: "t3-code",
    scheme: "t3code",
    owner: "pingdotgg",
    updates: { enabled: true, url: "https://u.expo.dev/project" },
    ios: {
      bundleIdentifier: "com.t3tools.t3code",
      appleTeamId: "TEAM",
      associatedDomains: ["applinks:clerk.t3.codes"],
      entitlements: { "keychain-access-groups": ["com.t3tools.t3code"] },
    },
    android: {
      package: "com.t3tools.t3code",
      intentFilters: [
        { action: "VIEW", autoVerify: true, data: [{ scheme: "https", host: "app.t3.codes" }] },
      ],
    },
    extra: { eas: { projectId: "d763fcb8-d37c-41ea-a773-b54a0ab4a454" } },
    plugins: [
      [
        "expo-widgets",
        { bundleIdentifier: "com.t3tools.t3code.widgets", enablePushNotifications: true },
      ],
    ],
  };
}
it.each(["development", "preview", "production"] as const)(
  "keeps upstream unchanged and isolates standalone %s",
  (variant) => {
    const original = fixture();
    expect(applyMobileBrand(original, { variant, env: {} })).toBe(original);
    const result = applyMobileBrand(original, { variant, env });
    const suffix = variant === "production" ? "" : variant === "development" ? ".dev" : ".preview";
    expect(result.android?.package).toBe(`com.ritikrishu.botduetdot${suffix}`);
    expect(result.updates).toEqual({ enabled: false });
    expect(result.android?.intentFilters).toBeUndefined();
    expect(result.ios?.associatedDomains).toBeUndefined();
    expect(result.ios?.entitlements).toBeUndefined();
    expect(result.owner).toBeUndefined();
    expect(result.extra?.eas).toBeUndefined();
    expect(result.android?.versionCode).toBe(2026111601);
    expect(result.plugins).toContain("./plugins/withAndroidReleaseSigning.cjs");
    expect(result.android?.blockedPermissions).toContain("android.permission.SYSTEM_ALERT_WINDOW");
    expect(JSON.stringify(result)).not.toMatch(/t3code|t3tools|t3\.codes|u\.expo\.dev|d763fcb8/);
    expect(original.updates?.enabled).toBe(true);
  },
);
it.each([undefined, "1", "2026023001", "2026130101", "2101010101", "2026111601.0"])(
  "rejects invalid versionCode %s",
  (code) => {
    expect(() =>
      applyMobileBrand(fixture(), {
        variant: "production",
        env: { ...env, T3CODE_ANDROID_VERSION_CODE: code },
      }),
    ).toThrow(/VERSION_CODE/);
  },
);
it.each([
  { EXPO_PUBLIC_T3CODE_BRAND: undefined },
  { T3CODE_BRAND: "unknown" },
  { T3CODE_RELAY_URL: "https://relay.t3.codes" },
  { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture" },
  { T3CODE_ANDROID_GOOGLE_SERVICES_FILE: "fixture.json" },
  { T3CODE_MOBILE_UPDATES_ENABLED: "1" },
  { T3CODE_MOBILE_VERSION: undefined },
])("rejects incompatible environment %j", (override) => {
  expect(() =>
    applyMobileBrand(fixture(), { variant: "production", env: { ...env, ...override } }),
  ).toThrow();
});
