import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import Plist from "plist";
import {
  applyDesktopBrandBuildConfig,
  desktopBrandStageMetadata,
  renderStandaloneMacEntitlements,
  resolveBrandIconAssets,
  stageBrandDmgBackground,
} from "./desktop-brand.ts";

it("preserves the upstream configuration unchanged", () => {
  const config = {
    appId: UPSTREAM_BRAND.desktop.appId,
    publish: null,
    mac: { provisioningProfile: "upstream.profile" },
  };
  assert.strictEqual(applyDesktopBrandBuildConfig(config, UPSTREAM_BRAND), config);
});

it("forces the standalone feed and identity while preserving macOS permissions and viewer role", () => {
  const config = {
    appId: UPSTREAM_BRAND.desktop.appId,
    publish: [{ provider: "github", owner: "pingdotgg", repo: "t3code" }],
    mac: {
      provisioningProfile: "upstream.profile",
      entitlements: "upstream.plist",
      extendInfo: {
        NSCameraUsageDescription: "T3 Code uses the camera.",
        CFBundleDocumentTypes: [{ CFBundleTypeRole: "Viewer" }],
      },
    },
  };
  const result = applyDesktopBrandBuildConfig(config, STANDALONE_BRAND);
  assert.equal(result.appId, "com.ritikrishu.botduetdot");
  assert.equal(result.productName, "BotDuetDot");
  assert.equal(result.artifactName, "BotDuetDot-${version}-${arch}.${ext}");
  assert.deepEqual(result.publish, [
    {
      provider: "github",
      owner: "ritikrishu",
      repo: "botduetdot",
      channel: "latest",
      releaseType: "release",
    },
  ]);
  assert.deepEqual(result.mac, {
    entitlements: "entitlements.mac.plist",
    entitlementsInherit: "entitlements.mac.plist",
    extendInfo: {
      NSAudioCaptureUsageDescription:
        "BotDuetDot lets commands run by terminals and coding agents capture system audio.",
      NSBluetoothAlwaysUsageDescription:
        "BotDuetDot lets commands run by terminals and coding agents use Bluetooth.",
      NSBluetoothPeripheralUsageDescription:
        "BotDuetDot lets commands run by terminals and coding agents use Bluetooth.",
      NSCameraUsageDescription: "BotDuetDot uses the camera.",
      CFBundleDocumentTypes: [{ CFBundleTypeRole: "Viewer" }],
    },
    protocols: [
      { name: "BotDuetDot", schemes: ["botduetdot", "botduetdot-dev"] },
      { name: "Web site URL", schemes: ["http", "https"], role: "Viewer" },
    ],
  });
  assert.deepEqual(result.files, [
    "!apps/desktop/prod-resources/installer.nsh",
    "!apps/desktop/prod-resources/linux",
    "!apps/desktop/prod-resources/linux/**/*",
  ]);
  assert.equal(config.mac.provisioningProfile, "upstream.profile");
  assert.deepEqual(desktopBrandStageMetadata(STANDALONE_BRAND), {
    name: "botduetdot",
    productName: "BotDuetDot",
    description: STANDALONE_BRAND.desktop.description,
    homepage: "https://ritikrishu.github.io/botduetdot/",
    author: "ritikrishu",
  });
});

it("keeps upstream stage metadata without a top-level productName", () => {
  assert.notProperty(desktopBrandStageMetadata(UPSTREAM_BRAND), "productName");
});

it("ships exactly the unrestricted runtime and device entitlements", () => {
  assert.deepEqual(Plist.parse(renderStandaloneMacEntitlements()), {
    "com.apple.security.cs.allow-jit": true,
    "com.apple.security.cs.allow-unsigned-executable-memory": true,
    "com.apple.security.cs.disable-library-validation": true,
    "com.apple.security.device.camera": true,
    "com.apple.security.device.audio-input": true,
  });
});

it.effect("stages brand artwork without changing upstream sources", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const stage = path.join(root, "stage");
    const source = path.join(root, STANDALONE_BRAND.desktop.assetDir!);
    yield* fs.makeDirectory(source, { recursive: true });
    yield* fs.makeDirectory(path.join(stage, "dmg"), { recursive: true });
    yield* fs.writeFileString(path.join(source, "dmg-background.svg"), "<svg>brand</svg>");
    const target = path.join(stage, "dmg/dmg-background-latest.svg");
    yield* fs.writeFileString(target, "<svg>upstream</svg>");
    yield* stageBrandDmgBackground(UPSTREAM_BRAND, root, stage, "latest");
    assert.equal(yield* fs.readFileString(target), "<svg>upstream</svg>");
    yield* stageBrandDmgBackground(STANDALONE_BRAND, root, stage, "latest");
    assert.equal(yield* fs.readFileString(target), "<svg>brand</svg>");
    const icons = {
      macIconPng: "upstream.png",
      linuxIconPng: "linux.png",
      windowsIconIco: "windows.ico",
    };
    assert.strictEqual(resolveBrandIconAssets(UPSTREAM_BRAND, icons), icons);
    assert.deepEqual(resolveBrandIconAssets(STANDALONE_BRAND, icons), {
      macIconPng: "assets/brand/standalone/macos-1024.png",
      linuxIconPng: "assets/brand/standalone/universal-1024.png",
      windowsIconIco: "assets/brand/standalone/web/favicon.ico",
    });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
