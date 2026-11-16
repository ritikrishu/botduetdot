import { describe, expect, it, vi } from "vite-plus/test";

import {
  brandAppSchemePattern,
  brandAppSchemes,
  brandRepositoryUrl,
  defineStandaloneBrand,
  desktopRendererOrigins,
  isBrandAppProtocol,
  resolveBrandProfile,
  STANDALONE_BRAND,
  UPSTREAM_BRAND,
} from "./brand.ts";

describe("brand profiles", () => {
  it("defaults to the existing upstream literals", () => {
    expect(resolveBrandProfile(undefined)).toBe(UPSTREAM_BRAND);
    expect(resolveBrandProfile("upstream")).toBe(UPSTREAM_BRAND);
    expect(UPSTREAM_BRAND).toEqual({
      id: "upstream",
      // apps/desktop/src/app/DesktopEnvironment.ts:88; scripts/build-desktop-artifact.ts:3872
      name: "T3 Code",
      slug: "t3code",
      // apps/server/src/os-jank.ts:126; apps/server/src/cli/invocation.ts:100
      homeDirName: ".t3",
      cliName: "t3",
      // packages/shared/src/cliRelease.ts:6
      repository: "pingdotgg/t3code",
      // packages/shared/src/remote.ts:7; packages/shared/src/promptLinks.ts:184
      schemePolicy: "prefix",
      // apps/mobile/app.config.ts:83,91,99; apps/desktop/src/electron/ElectronProtocol.ts:16-17
      schemes: {
        production: "t3code",
        development: "t3code-dev",
        preview: "t3code-preview",
      },
      // packages/shared/src/connectAuth.ts:10; apps/server/src/cloud/publicConfig.ts:118
      hostedApp: {
        url: "https://app.t3.codes",
        nightlyUrl: "https://nightly.app.t3.codes",
        // apps/web/src/components/settings/pairingUrls.ts:12 (unconditional hosted links)
        pairingLinks: true,
      },
      // apps/server/src/cloud/publicConfig.ts:104-225; environment/ServerEnvironment.ts:274,278,286
      features: {
        t3Connect: true,
        triage: true,
        npmReleaseLookup: true,
        updateTrackSwitch: true,
      },
      // apps/server/src/cloud/npmRelease.ts:66,90
      npmPackage: "t3",
      // apps/server/src/telemetry/AnalyticsService.ts:69-74
      analytics: {
        enabledByDefault: true,
        posthogHost: "https://ingest.t3.codes",
        posthogKey: "phc_XOWci4oZP4VvLiEyrFqkFjP4CZn55mjYYBMREK5Wd6m",
      },
      // apps/server/src/provider/ModelManifest.ts:26
      modelManifestUrl:
        "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json",
      links: {
        // scripts/build-desktop-artifact.ts:3883; apps/web/src/legalLinks.ts:1
        marketingSite: "https://t3.codes",
        privacyPolicy: "https://t3.codes/privacy-policy",
        // apps/web/src/branding.ts:28,30
        download: "https://t3.codes/download",
        mobileApp: "https://t3.codes/mobile",
        // apps/web/src/components/settings/MobileAppSettingsRow.tsx:12,18
        androidStore: "https://play.google.com/store/apps/details?id=com.t3tools.t3code",
        iosStore: "https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824",
        // apps/web/src/lib/bootError.ts:5; apps/server/src/cli/install.ts:55-56
        issues: "https://github.com/pingdotgg/t3code/issues/new",
        installSh: "https://t3.codes/install.sh",
        installPs1: "https://t3.codes/install.ps1",
      },
      desktop: {
        // scripts/build-desktop-artifact.ts:65; apps/desktop/src/app/DesktopEnvironment.ts:231
        appId: "com.t3tools.t3code",
        devAppId: "com.t3tools.t3code.dev",
        // apps/desktop/package.json:43; scripts/build-desktop-artifact.ts:2762,2786
        productName: "T3 Code (Beta)",
        nightlyProductName: "T3 Code (Nightly)",
        artifactBaseName: "T3-Code",
        // apps/desktop/src/app/DesktopUserData.ts:42-44 (production and development profiles)
        userDataDirName: "t3code-v2",
        devUserDataDirName: "t3code-dev",
        legacyUserDataDirName: "T3 Code (Alpha)",
        devLegacyUserDataDirName: "T3 Code (Dev)",
        // apps/desktop/src/app/DesktopLegacyLocalStorage.ts:24
        legacyLocalStorageProfileNames: ["T3 Code (Alpha)", "t3code"],
        // apps/desktop/src/app/DesktopEnvironment.ts:230-232
        appUserModelId: "com.t3tools.t3code",
        devAppUserModelId: "com.t3tools.t3code.dev",
        // scripts/build-desktop-artifact.ts:3814-3858 (signed mac passkey gate)
        macPasskeys: true,
        // scripts/build-desktop-artifact.ts:3880-3884
        author: "T3 Tools",
        homepage: "https://t3.codes",
        description:
          "T3 Code is an open-source desktop app for coding agents. Work with your existing agent subscriptions, review code changes, and run commands in your projects. Connect from desktop, web, or mobile to continue working remotely.",
        // apps/desktop/src/app/DesktopAppIdentity.ts:98-102 (no credits); scripts/lib/brand-assets.ts:1-38
        aboutCredits: null,
        assetDir: null,
      },
      // apps/server/src/cloud/bootService.ts:38-42
      service: {
        launchdLabel: "com.t3tools.t3code.service",
        systemdUnitName: "t3code.service",
      },
      // packages/shared/src/managedPolicyFile.ts:99-100
      managedPolicy: {
        macDomain: "com.t3tools.t3code",
        windowsSubkey: "SOFTWARE\\Policies\\T3Tools\\T3Code",
      },
      mobile: {
        // apps/mobile/app.config.ts:237
        expoSlug: "t3-code",
        // apps/mobile/app.config.ts:98-102
        appName: "T3 Code",
        androidPackage: "com.t3tools.t3code",
        iosBundleIdentifier: "com.t3tools.t3code",
        // apps/mobile/app.config.ts:495,499,252,120,102,264
        easProjectId: "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
        easOwner: "pingdotgg",
        updatesUrl: "https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454",
        hostedLinkHost: "app.t3.codes",
        relyingParty: "clerk.t3.codes",
        appleTeamId: "ARK85ZXQ4Z",
      },
      // packages/source-control-github/src/server/githubStackRebase.ts:74,76
      git: { committerName: "T3 Code", committerEmail: "noreply@t3.codes" },
    });
  });

  it("derives a separate standalone identity with no upstream service defaults", () => {
    expect(resolveBrandProfile("standalone")).toBe(STANDALONE_BRAND);
    expect(defineStandaloneBrand()).toEqual(STANDALONE_BRAND);
    expect(STANDALONE_BRAND).toEqual({
      id: "standalone",
      name: "BotDuetDot",
      slug: "botduetdot",
      homeDirName: ".botduetdot",
      cliName: "botduetdot",
      repository: "ritikrishu/botduetdot",
      schemePolicy: "exact",
      schemes: {
        production: "botduetdot",
        development: "botduetdot-dev",
        preview: "botduetdot-preview",
      },
      hostedApp: {
        url: "https://app.botduetdot.invalid",
        nightlyUrl: null,
        pairingLinks: false,
      },
      features: {
        t3Connect: false,
        triage: false,
        npmReleaseLookup: false,
        updateTrackSwitch: false,
      },
      npmPackage: null,
      analytics: { enabledByDefault: false, posthogHost: "", posthogKey: "" },
      modelManifestUrl: null,
      links: {
        marketingSite: "https://ritikrishu.github.io/botduetdot/",
        privacyPolicy: "https://ritikrishu.github.io/botduetdot/privacy-policy",
        download: "https://github.com/ritikrishu/botduetdot/releases/latest",
        mobileApp: "https://play.google.com/store/apps/details?id=com.ritikrishu.botduetdot",
        androidStore: "https://play.google.com/store/apps/details?id=com.ritikrishu.botduetdot",
        iosStore: null,
        issues: "https://github.com/ritikrishu/botduetdot/issues/new",
        installSh: null,
        installPs1: null,
      },
      desktop: {
        appId: "com.ritikrishu.botduetdot",
        devAppId: "com.ritikrishu.botduetdot.dev",
        productName: "BotDuetDot",
        nightlyProductName: "BotDuetDot",
        artifactBaseName: "BotDuetDot",
        userDataDirName: "botduetdot",
        devUserDataDirName: "botduetdot-dev",
        legacyUserDataDirName: null,
        devLegacyUserDataDirName: null,
        legacyLocalStorageProfileNames: [],
        appUserModelId: "com.ritikrishu.botduetdot",
        devAppUserModelId: "com.ritikrishu.botduetdot.dev",
        macPasskeys: false,
        author: "ritikrishu",
        homepage: "https://ritikrishu.github.io/botduetdot/",
        description:
          "BotDuetDot is an open-source desktop app for coding agents. Work with your existing agent subscriptions, review code changes, and run commands in your projects. Connect from desktop, web, or mobile to continue working remotely.",
        aboutCredits: "Based on T3 Code © 2026 T3 Tools Inc. (MIT License)",
        assetDir: "assets/brand/standalone",
      },
      service: {
        launchdLabel: "com.ritikrishu.botduetdot.service",
        systemdUnitName: "botduetdot.service",
      },
      managedPolicy: {
        macDomain: "com.ritikrishu.botduetdot",
        windowsSubkey: "SOFTWARE\\Policies\\ritikrishu\\BotDuetDot",
      },
      mobile: {
        expoSlug: "botduetdot",
        appName: "BotDuetDot",
        androidPackage: "com.ritikrishu.botduetdot",
        iosBundleIdentifier: "com.ritikrishu.botduetdot",
        easProjectId: null,
        easOwner: null,
        updatesUrl: null,
        hostedLinkHost: null,
        relyingParty: null,
        appleTeamId: null,
      },
      git: { committerName: "BotDuetDot", committerEmail: "noreply@botduetdot.invalid" },
    });
  });

  it.each(["", "other", "Standalone", " standalone", "upstream "])(
    "rejects an unknown brand id %j",
    (id) => {
      expect(() => resolveBrandProfile(id)).toThrow("Unknown T3CODE_BRAND");
    },
  );
});

describe("brand selection", () => {
  it.each([
    [undefined, undefined, "upstream"],
    ["upstream", undefined, "upstream"],
    ["standalone", undefined, "standalone"],
    [undefined, "standalone", "standalone"],
    ["standalone", "standalone", "standalone"],
  ])("selects Node %j / Expo %j as %s", async (nodeBrand, expoBrand, expected) => {
    vi.stubEnv("T3CODE_BRAND", nodeBrand);
    vi.stubEnv("EXPO_PUBLIC_T3CODE_BRAND", expoBrand);
    vi.resetModules();
    try {
      const { BRAND } = await import("./brand.ts");
      expect(BRAND).toEqual(expected === "upstream" ? UPSTREAM_BRAND : STANDALONE_BRAND);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("rejects an unknown environment selector at module load", async () => {
    vi.stubEnv("T3CODE_BRAND", "typo");
    vi.stubEnv("EXPO_PUBLIC_T3CODE_BRAND", undefined);
    vi.resetModules();
    try {
      await expect(import("./brand.ts")).rejects.toThrow("Unknown T3CODE_BRAND");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("uses a baked profile even with an invalid runtime selector", async () => {
    vi.stubGlobal("__T3CODE_BRAND_PROFILE__", STANDALONE_BRAND);
    vi.stubEnv("T3CODE_BRAND", "typo");
    vi.stubEnv("EXPO_PUBLIC_T3CODE_BRAND", "typo");
    vi.resetModules();
    try {
      const { BRAND, isBrandAppProtocol, brandRepositoryUrl } = await import("./brand.ts");
      expect(BRAND).toBe(STANDALONE_BRAND);
      expect(isBrandAppProtocol("botduetdot:")).toBe(true);
      expect(isBrandAppProtocol("t3code:")).toBe(false);
      expect(brandRepositoryUrl("issues")).toBe("https://github.com/ritikrishu/botduetdot/issues");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("can be imported without a Node process global", async () => {
    vi.stubGlobal("process", undefined);
    vi.resetModules();
    try {
      const { BRAND } = await import("./brand.ts");
      expect(BRAND.id).toBe("upstream");
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe("brand protocols and origins", () => {
  it("preserves the upstream parser including arbitrary lowercase channel suffixes", () => {
    // packages/shared/src/remote.ts:7 and promptLinks.ts:184
    const pattern = brandAppSchemePattern(UPSTREAM_BRAND);
    expect(pattern.source).toBe("^t3code(?:-[a-z]+)?:$");
    expect(pattern.flags).toBe("");
    expect(brandAppSchemes(UPSTREAM_BRAND)).toEqual(["t3code", "t3code-dev", "t3code-preview"]);
    for (const protocol of [
      "t3code:",
      "t3code-dev:",
      "t3code-preview:",
      "t3code-nightly:",
      "t3code-custom:",
    ]) {
      expect(isBrandAppProtocol(protocol, UPSTREAM_BRAND)).toBe(true);
    }
    for (const protocol of [
      "t3code",
      "t3code-:",
      "t3code-Nightly:",
      "t3code-dev2:",
      "botduetdot:",
      "https:",
    ]) {
      expect(isBrandAppProtocol(protocol, UPSTREAM_BRAND)).toBe(false);
    }
  });

  it("accepts exactly the three standalone schemes", () => {
    expect(brandAppSchemes(STANDALONE_BRAND)).toEqual([
      "botduetdot",
      "botduetdot-dev",
      "botduetdot-preview",
    ]);
    const pattern = brandAppSchemePattern(STANDALONE_BRAND);
    for (const protocol of ["botduetdot:", "botduetdot-dev:", "botduetdot-preview:"]) {
      expect(pattern.test(protocol)).toBe(true);
      expect(isBrandAppProtocol(protocol, STANDALONE_BRAND)).toBe(true);
    }
    for (const protocol of [
      "t3code:",
      "t3code-dev:",
      "t3code-preview:",
      "t3code-nightly:",
      "botduetdot-nightly:",
      "botduetdot-custom:",
      "exp+botduetdot:",
      "botduetdot",
      "BotDuetDot:",
      "botduetdot://",
      "botduetdot-dev:extra",
      "https:",
    ]) {
      expect(pattern.test(protocol)).toBe(false);
      expect(isBrandAppProtocol(protocol, STANDALONE_BRAND)).toBe(false);
    }
  });

  it("derives and escapes the prefix pattern from the profile slug and policy", () => {
    const brand = {
      ...STANDALONE_BRAND,
      schemePolicy: "prefix" as const,
      slug: "example.app+client",
    };
    for (const protocol of ["example.app+client:", "example.app+client-nightly:"]) {
      expect(isBrandAppProtocol(protocol, brand)).toBe(true);
    }
    for (const protocol of [
      "exampleXapp+client:",
      "example.apppclient:",
      "example.app+client-Nightly:",
      "t3code:",
      "botduetdot:",
    ]) {
      expect(isBrandAppProtocol(protocol, brand)).toBe(false);
    }
  });

  it("derives and escapes exact schemes independently of the profile id and slug", () => {
    const brand = {
      ...UPSTREAM_BRAND,
      schemePolicy: "exact" as const,
      schemes: {
        production: "example.app",
        development: "example+dev",
        preview: "example-preview",
      },
    };
    expect(isBrandAppProtocol("example.app:", brand)).toBe(true);
    expect(isBrandAppProtocol("example+dev:", brand)).toBe(true);
    expect(isBrandAppProtocol("example-preview:", brand)).toBe(true);
    expect(isBrandAppProtocol("exampleXapp:", brand)).toBe(false);
    expect(isBrandAppProtocol("exampleeeedev:", brand)).toBe(false);
    expect(isBrandAppProtocol("example.app-nightly:", brand)).toBe(false);
    expect(isBrandAppProtocol("t3code:", brand)).toBe(false);
  });

  it("returns just the two desktop renderer origins for each profile", () => {
    // apps/server/src/httpCors.ts:13; the caller owns cross-brand CORS interop.
    expect(desktopRendererOrigins(UPSTREAM_BRAND)).toEqual(["t3code://app", "t3code-dev://app"]);
    expect(desktopRendererOrigins(STANDALONE_BRAND)).toEqual([
      "botduetdot://app",
      "botduetdot-dev://app",
    ]);
  });

  it.each([UPSTREAM_BRAND, STANDALONE_BRAND])("joins repository paths for $id", (brand) => {
    const root = `https://github.com/${brand.repository}`;
    expect(brandRepositoryUrl("", brand)).toBe(root);
    expect(brandRepositoryUrl("issues", brand)).toBe(`${root}/issues`);
    expect(brandRepositoryUrl("/blob/main/docs/user/faq.md#accounts", brand)).toBe(
      `${root}/blob/main/docs/user/faq.md#accounts`,
    );
  });
});
