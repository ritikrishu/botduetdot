import { resolveBrandProfile, type BrandProfile } from "@t3tools/contracts/brandProfiles";

import { loadRepoEnv } from "./public-config.ts";

type Environment = Readonly<Record<string, string | undefined>>;

const FORBIDDEN_ENV_PATTERNS = [
  /^(T3CODE|VITE|EXPO_PUBLIC)_CLERK_/,
  /^(VITE_)?T3CODE_RELAY_/,
  /^VITE_RELAY_OTLP_/,
  /^T3CODE_MOBILE_OTLP_/,
  /^EXPO_PUBLIC_OTLP_/,
  /^T3CODE_POSTHOG_/,
];

const FORBIDDEN_ENV_NAMES = new Set([
  "T3CODE_GITHUB_APP_CLIENT_ID",
  "T3CODE_HOSTED_APP_URL",
  "VITE_HOSTED_APP_URL",
  "VITE_HOSTED_APP_CHANNEL",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "T3CODE_ANDROID_GOOGLE_SERVICES_FILE",
]);

export function assertBrandBuildEnv(env: Environment, brand: BrandProfile): void {
  if (brand.id !== "standalone") return;

  const forbidden = Object.entries(env)
    .filter(([name, value]) => {
      if (value === undefined) return false;
      if (name === "T3CODE_MOBILE_UPDATES_ENABLED") return value !== "0";
      if (name === "T3CODE_DESKTOP_UPDATE_REPOSITORY") return value !== brand.repository;
      return (
        FORBIDDEN_ENV_NAMES.has(name) ||
        FORBIDDEN_ENV_PATTERNS.some((pattern) => pattern.test(name))
      );
    })
    .map(([name]) => name)
    .sort();

  if (forbidden.length > 0) {
    throw new Error(`Forbidden environment variables for ${brand.name}: ${forbidden.join(", ")}.`);
  }
}

export function brandBuildDefine(env: Environment = loadRepoEnv()): {
  readonly __T3CODE_BRAND_PROFILE__: string;
} {
  const brand = resolveBrandProfile(env.T3CODE_BRAND);
  assertBrandBuildEnv(env, brand);
  return { __T3CODE_BRAND_PROFILE__: JSON.stringify(brand) };
}
