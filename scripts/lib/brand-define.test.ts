import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { describe, expect, it } from "vite-plus/test";

import { assertBrandBuildEnv, brandBuildDefine } from "./brand-define.ts";

const FORBIDDEN_ENV_NAMES = [
  "T3CODE_CLERK_PUBLISHABLE_KEY",
  "T3CODE_CLERK_CLI_OAUTH_CLIENT_ID",
  "T3CODE_CLERK_JWT_TEMPLATE",
  "T3CODE_CLERK_PASSKEY_RP_DOMAINS",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "VITE_CLERK_CLI_OAUTH_CLIENT_ID",
  "VITE_CLERK_JWT_TEMPLATE",
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_CLERK_JWT_TEMPLATE",
  "T3CODE_RELAY_URL",
  "T3CODE_RELAY_CLIENT_OTLP_TRACES_URL",
  "T3CODE_RELAY_CLIENT_OTLP_TRACES_DATASET",
  "T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN",
  "VITE_T3CODE_RELAY_URL",
  "VITE_T3CODE_RELAY_CLIENT_OTLP_TRACES_URL",
  "VITE_RELAY_OTLP_TRACES_URL",
  "VITE_RELAY_OTLP_TRACES_DATASET",
  "VITE_RELAY_OTLP_TRACES_TOKEN",
  "T3CODE_MOBILE_OTLP_TRACES_URL",
  "T3CODE_MOBILE_OTLP_TRACES_DATASET",
  "T3CODE_MOBILE_OTLP_TRACES_TOKEN",
  "EXPO_PUBLIC_OTLP_TRACES_URL",
  "EXPO_PUBLIC_OTLP_TRACES_DATASET",
  "EXPO_PUBLIC_OTLP_TRACES_TOKEN",
  "T3CODE_POSTHOG_KEY",
  "T3CODE_POSTHOG_HOST",
  "T3CODE_GITHUB_APP_CLIENT_ID",
  "T3CODE_HOSTED_APP_URL",
  "VITE_HOSTED_APP_URL",
  "VITE_HOSTED_APP_CHANNEL",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "T3CODE_ANDROID_GOOGLE_SERVICES_FILE",
  "T3CODE_CLERK_FUTURE_SETTING",
  "VITE_CLERK_FUTURE_SETTING",
  "EXPO_PUBLIC_CLERK_FUTURE_SETTING",
  "T3CODE_RELAY_FUTURE_SETTING",
  "VITE_T3CODE_RELAY_FUTURE_SETTING",
  "VITE_RELAY_OTLP_FUTURE_SETTING",
  "T3CODE_MOBILE_OTLP_FUTURE_SETTING",
  "EXPO_PUBLIC_OTLP_FUTURE_SETTING",
  "T3CODE_POSTHOG_FUTURE_SETTING",
];

describe("brandBuildDefine", () => {
  it("serializes the resolved profile as a Vite define", () => {
    expect(brandBuildDefine({})).toEqual({
      __T3CODE_BRAND_PROFILE__: JSON.stringify(UPSTREAM_BRAND),
    });
    expect(brandBuildDefine({ T3CODE_BRAND: "upstream" })).toEqual(brandBuildDefine({}));
    expect(brandBuildDefine({ T3CODE_BRAND: "standalone" })).toEqual({
      __T3CODE_BRAND_PROFILE__: JSON.stringify(STANDALONE_BRAND),
    });
  });

  it.each(["", "invalid", "Standalone"])("rejects an unknown build selector %j", (id) => {
    expect(() => brandBuildDefine({ T3CODE_BRAND: id })).toThrow("Unknown T3CODE_BRAND");
  });

  it.each(FORBIDDEN_ENV_NAMES)("rejects standalone builds with %s set", (name) => {
    for (const value of ["sensitive-value", "", " ", "0"]) {
      const env = { T3CODE_BRAND: "standalone", [name]: value };
      expect(() => brandBuildDefine(env)).toThrow(
        `Forbidden environment variables for BotDuetDot: ${name}.`,
      );
      expect(() => assertBrandBuildEnv(env, STANDALONE_BRAND)).toThrow(name);
    }
    expect(() => brandBuildDefine({ T3CODE_BRAND: "standalone", [name]: undefined })).not.toThrow();
  });

  it.each(["1", "true", "false", "", " 0", "0 "])(
    "rejects standalone mobile update setting %j unless it is exactly 0",
    (value) => {
      expect(() =>
        brandBuildDefine({
          T3CODE_BRAND: "standalone",
          T3CODE_MOBILE_UPDATES_ENABLED: value,
        }),
      ).toThrow("T3CODE_MOBILE_UPDATES_ENABLED");
    },
  );

  it.each(["pingdotgg/t3code", "other/repo", "", "ritikrishu/botduetdot "])(
    "rejects a standalone desktop update repository mismatch %j",
    (repository) => {
      expect(() =>
        brandBuildDefine({
          T3CODE_BRAND: "standalone",
          T3CODE_DESKTOP_UPDATE_REPOSITORY: repository,
        }),
      ).toThrow("T3CODE_DESKTOP_UPDATE_REPOSITORY");
    },
  );

  it("allows disabled OTA, the owner update repository, and unrelated environment settings", () => {
    expect(
      brandBuildDefine({
        T3CODE_BRAND: "standalone",
        T3CODE_MOBILE_UPDATES_ENABLED: "0",
        T3CODE_DESKTOP_UPDATE_REPOSITORY: "ritikrishu/botduetdot",
        EXPO_PUBLIC_T3CODE_BRAND: "standalone",
        T3CODE_HOME: "/tmp/brand-test-home",
        GITHUB_REPOSITORY: "unrelated/repository",
        APPLE_API_KEY: "/tmp/signing-key",
        T3CODE_ANDROID_VERSION_CODE: "2026111601",
        UNRELATED_T3CODE_POSTHOG_KEY: "unrelated",
      }),
    ).toEqual({ __T3CODE_BRAND_PROFILE__: JSON.stringify(STANDALONE_BRAND) });
  });

  it("keeps all upstream build overrides available with the default or explicit upstream profile", () => {
    const env = {
      ...Object.fromEntries(FORBIDDEN_ENV_NAMES.map((name) => [name, "configured"])),
      T3CODE_MOBILE_UPDATES_ENABLED: "1",
      T3CODE_DESKTOP_UPDATE_REPOSITORY: "other/repository",
    };
    expect(brandBuildDefine(env)).toEqual({
      __T3CODE_BRAND_PROFILE__: JSON.stringify(UPSTREAM_BRAND),
    });
    expect(brandBuildDefine({ ...env, T3CODE_BRAND: "upstream" })).toEqual(brandBuildDefine(env));
    expect(() => assertBrandBuildEnv(env, UPSTREAM_BRAND)).not.toThrow();
  });

  it("reports every forbidden variable by name without leaking its value", () => {
    expect(() =>
      brandBuildDefine({
        T3CODE_BRAND: "standalone",
        VITE_HOSTED_APP_URL: "https://private.example.test",
        T3CODE_POSTHOG_KEY: "sensitive-key",
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "sensitive-clerk-key",
      }),
    ).toThrow(
      new Error(
        "Forbidden environment variables for BotDuetDot: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, T3CODE_POSTHOG_KEY, VITE_HOSTED_APP_URL.",
      ),
    );
  });
});
