import type { ExpoConfig } from "expo/config";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { assertBrandBuildEnv } from "../../scripts/lib/brand-define.ts";

type Variant = "development" | "preview" | "production";
type Environment = Readonly<Record<string, string | undefined>>;
const assets = "../../assets/brand/standalone";

function versionCode(value: string | undefined, variant: Variant): number | undefined {
  if (value === undefined && variant !== "production") return undefined;
  if (!value || !/^\d{10}$/.test(value) || Number(value) > 2_100_000_000) {
    throw new Error("T3CODE_ANDROID_VERSION_CODE must be YYYYMMDDNN (at most 2100000000).");
  }
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("T3CODE_ANDROID_VERSION_CODE must contain a valid calendar date.");
  }
  return Number(value);
}

export function applyMobileBrand(
  config: ExpoConfig,
  { variant, env }: { variant: Variant; env: Environment },
): ExpoConfig {
  const brand = resolveBrandProfile(env.T3CODE_BRAND);
  const publicBrand = resolveBrandProfile(env.EXPO_PUBLIC_T3CODE_BRAND);
  if (brand.id !== publicBrand.id) {
    throw new Error("T3CODE_BRAND and EXPO_PUBLIC_T3CODE_BRAND must agree.");
  }
  assertBrandBuildEnv(env, brand);
  if (brand.id === "upstream") return config;
  const suffix = variant === "production" ? "" : variant === "development" ? ".dev" : ".preview";
  const bundleId = brand.mobile.iosBundleIdentifier + suffix;
  // Config is JSON: replace inherited identity in plugin options, permission strings and widget text too.
  const result: ExpoConfig = JSON.parse(
    JSON.stringify(config)
      .replaceAll(config.ios?.bundleIdentifier ?? "com.t3tools.t3code", bundleId)
      .replaceAll("T3 Code", brand.mobile.appName),
  );
  result.name =
    brand.mobile.appName +
    (variant === "production" ? "" : variant === "development" ? " Dev" : " Preview");
  result.slug = brand.mobile.expoSlug;
  result.scheme = brand.schemes[variant];
  if (variant === "production" && !env.T3CODE_MOBILE_VERSION)
    throw new Error("T3CODE_MOBILE_VERSION is required for standalone production.");
  result.version = env.T3CODE_MOBILE_VERSION ?? config.version;
  result.icon = `${assets}/universal-1024.png`;
  result.updates = { enabled: false };
  delete result.owner;
  result.ios = { ...result.ios, bundleIdentifier: bundleId, icon: `${assets}/ios-1024.png` };
  delete result.ios.appleTeamId;
  delete result.ios.associatedDomains;
  delete result.ios.entitlements;
  result.android = {
    ...result.android,
    package: brand.mobile.androidPackage + suffix,
    icon: `${assets}/universal-1024.png`,
    adaptiveIcon: {
      foregroundImage: `${assets}/android/adaptive-foreground.png`,
      backgroundImage: `${assets}/android/adaptive-background.png`,
      monochromeImage: `${assets}/android/monochrome.png`,
    },
    blockedPermissions: [
      ...new Set([
        ...(config.android?.blockedPermissions ?? []),
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ]),
    ],
  };
  const code = versionCode(env.T3CODE_ANDROID_VERSION_CODE, variant);
  if (code !== undefined) result.android.versionCode = code;
  delete result.android.intentFilters;
  delete result.android.googleServicesFile;
  result.web = { ...result.web, favicon: `${assets}/web/favicon.ico` };
  result.extra = {
    ...result.extra,
    brand: { id: brand.id, name: brand.name },
    relay: { url: null },
    clerk: { publishableKey: null, jwtTemplate: null },
    observability: { tracesUrl: null, tracesDataset: null, tracesToken: null },
  };
  delete result.extra.eas;
  for (const key of Object.keys(result.extra))
    if (key.startsWith("EXPO_PUBLIC_CLERK_")) delete result.extra[key];
  result.plugins = (result.plugins ?? []).map((plugin) => {
    if (!Array.isArray(plugin)) return plugin;
    const [name, options] = plugin;
    switch (name) {
      case "expo-notifications":
        return [name, { ...options, icon: `${assets}/android/notification.png` }];
      case "@clerk/expo":
        return [name, { ...options, appleSignIn: false }];
      case "expo-widgets":
        return [name, { ...options, enablePushNotifications: false }];
      case "expo-quick-actions":
        return [
          name,
          {
            ...options,
            androidIcons: {
              shortcut_icon: {
                foregroundImage: `${assets}/android/adaptive-foreground.png`,
                backgroundImage: `${assets}/android/adaptive-background.png`,
              },
            },
          },
        ];
      case "expo-splash-screen":
        return [
          name,
          {
            ...options,
            image: `${assets}/universal-1024.png`,
            dark: { ...options.dark, image: `${assets}/universal-1024.png` },
            android: {
              ...options.android,
              image: `${assets}/android/splash.png`,
              dark: { ...options.android?.dark, image: `${assets}/android/splash.png` },
            },
          },
        ];
      default:
        return plugin;
    }
  });
  result.plugins.push("./plugins/withAndroidReleaseSigning.cjs");
  result.plugins.push("./plugins/withStandaloneIsolation.cjs");
  return result;
}
