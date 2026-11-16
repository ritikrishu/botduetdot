import type { BrandProfile } from "@t3tools/contracts/brandProfiles";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

// Electron's own Info.plist asks for these with "This app needs access to …", which macOS shows
// verbatim. Name the app and say why, like the descriptions the build config already sets.
const electronDefaultUsageDescriptions = (name: string) => ({
  NSAudioCaptureUsageDescription: `${name} lets commands run by terminals and coding agents capture system audio.`,
  NSBluetoothAlwaysUsageDescription: `${name} lets commands run by terminals and coding agents use Bluetooth.`,
  NSBluetoothPeripheralUsageDescription: `${name} lets commands run by terminals and coding agents use Bluetooth.`,
});

// Windows installer script and Linux AppStream metadata carry upstream identity and are unused
// on macOS; electron-builder reads them from apps/desktop/resources, not from the staged copy.
export const STANDALONE_MAC_FILE_EXCLUSIONS = [
  "!apps/desktop/prod-resources/installer.nsh",
  "!apps/desktop/prod-resources/linux",
  "!apps/desktop/prod-resources/linux/**/*",
] as const;

export function applyDesktopBrandBuildConfig(
  config: Record<string, unknown>,
  brand: BrandProfile,
): Record<string, unknown> {
  if (brand.id === "upstream") return config;
  const [owner, repo] = brand.repository.split("/");
  const result: Record<string, unknown> = {
    ...config,
    appId: brand.desktop.appId,
    productName: brand.desktop.productName,
    artifactName: `${brand.desktop.artifactBaseName}-\${version}-\${arch}.\${ext}`,
    publish: [{ provider: "github", owner, repo, channel: "latest", releaseType: "release" }],
  };
  if (config.mac) {
    const mac = config.mac as Record<string, unknown>;
    const { provisioningProfile: _profile, ...macWithoutProfile } = mac;
    result.files = [...((config.files ?? []) as string[]), ...STANDALONE_MAC_FILE_EXCLUSIONS];
    result.mac = {
      ...macWithoutProfile,
      entitlements: "entitlements.mac.plist",
      entitlementsInherit: "entitlements.mac.plist",
      extendInfo: {
        ...electronDefaultUsageDescriptions(brand.name),
        ...Object.fromEntries(
          Object.entries((mac.extendInfo ?? {}) as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === "string" ? value.replaceAll("T3 Code", brand.name) : value,
          ]),
        ),
      },
      protocols: [
        { name: brand.name, schemes: [brand.schemes.production, brand.schemes.development] },
        { name: "Web site URL", schemes: ["http", "https"], role: "Viewer" },
      ],
    };
  }
  return result;
}

export function desktopBrandStageMetadata(brand: BrandProfile) {
  return {
    name: brand.slug,
    // Upstream stages no top-level productName; the release checker reads it from app.asar.
    ...(brand.id === "upstream" ? {} : { productName: brand.desktop.productName }),
    description: brand.desktop.description,
    homepage: brand.desktop.homepage,
    author: brand.desktop.author,
  };
}

export function renderStandaloneMacEntitlements(): string {
  const keys = [
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.device.camera",
    "com.apple.security.device.audio-input",
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
${keys.map((key) => `  <key>${key}</key><true/>`).join("\n")}
</dict></plist>\n`;
}

export function resolveBrandIconAssets<
  T extends { macIconPng: string; linuxIconPng: string; windowsIconIco: string },
>(brand: BrandProfile, upstream: T) {
  const dir = brand.desktop.assetDir;
  return dir === null
    ? upstream
    : {
        macIconPng: `${dir}/macos-1024.png`,
        linuxIconPng: `${dir}/universal-1024.png`,
        windowsIconIco: `${dir}/web/favicon.ico`,
      };
}

export const stageBrandDmgBackground = Effect.fn("stageBrandDmgBackground")(function* (
  brand: BrandProfile,
  repoRoot: string,
  stageResourcesDir: string,
  channel: "latest" | "nightly",
) {
  if (brand.desktop.assetDir === null) return;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.copyFile(
    path.join(repoRoot, brand.desktop.assetDir, "dmg-background.svg"),
    path.join(stageResourcesDir, "dmg", `dmg-background-${channel}.svg`),
  );
});
