import { defineStandaloneBrand } from "./brandStandalone.ts";

export interface BrandProfile {
  readonly id: "upstream" | "standalone";
  readonly name: string;
  readonly slug: string;
  readonly homeDirName: string;
  readonly cliName: string;
  readonly repository: string;
  readonly schemePolicy: "prefix" | "exact";
  readonly schemes: {
    readonly production: string;
    readonly development: string;
    readonly preview: string;
  };
  readonly hostedApp: {
    readonly url: string;
    readonly nightlyUrl: string | null;
    readonly pairingLinks: boolean;
  };
  readonly features: {
    readonly t3Connect: boolean;
    readonly triage: boolean;
    readonly npmReleaseLookup: boolean;
    readonly updateTrackSwitch: boolean;
  };
  readonly npmPackage: string | null;
  readonly analytics: {
    readonly enabledByDefault: boolean;
    readonly posthogHost: string;
    readonly posthogKey: string;
  };
  readonly modelManifestUrl: string | null;
  readonly links: {
    readonly marketingSite: string;
    readonly privacyPolicy: string;
    readonly download: string;
    readonly mobileApp: string;
    readonly androidStore: string | null;
    readonly iosStore: string | null;
    readonly issues: string;
    readonly installSh: string | null;
    readonly installPs1: string | null;
  };
  readonly desktop: {
    readonly appId: string;
    readonly devAppId: string;
    readonly productName: string;
    readonly nightlyProductName: string;
    readonly artifactBaseName: string;
    readonly userDataDirName: string;
    readonly devUserDataDirName: string;
    readonly legacyUserDataDirName: string | null;
    readonly devLegacyUserDataDirName: string | null;
    readonly legacyLocalStorageProfileNames: readonly string[];
    readonly appUserModelId: string;
    readonly devAppUserModelId: string;
    readonly macPasskeys: boolean;
    readonly author: string;
    readonly homepage: string;
    readonly description: string;
    readonly aboutCredits: string | null;
    readonly assetDir: string | null;
  };
  readonly service: { readonly launchdLabel: string; readonly systemdUnitName: string };
  readonly managedPolicy: { readonly macDomain: string; readonly windowsSubkey: string };
  readonly mobile: {
    readonly expoSlug: string;
    readonly appName: string;
    readonly androidPackage: string;
    readonly iosBundleIdentifier: string;
    readonly easProjectId: string | null;
    readonly easOwner: string | null;
    readonly updatesUrl: string | null;
    readonly hostedLinkHost: string | null;
    readonly relyingParty: string | null;
    readonly appleTeamId: string | null;
  };
  readonly git: { readonly committerName: string; readonly committerEmail: string };
}

function defineUpstreamBrand(): BrandProfile {
  return {
    id: "upstream",
    name: "T3 Code",
    slug: "t3code",
    homeDirName: ".t3",
    cliName: "t3",
    repository: "pingdotgg/t3code",
    schemePolicy: "prefix",
    schemes: {
      production: "t3code",
      development: "t3code-dev",
      preview: "t3code-preview",
    },
    hostedApp: {
      url: "https://app.t3.codes",
      nightlyUrl: "https://nightly.app.t3.codes",
      pairingLinks: true,
    },
    features: {
      t3Connect: true,
      triage: true,
      npmReleaseLookup: true,
      updateTrackSwitch: true,
    },
    npmPackage: "t3",
    analytics: {
      enabledByDefault: true,
      posthogHost: "https://ingest.t3.codes",
      posthogKey: "phc_XOWci4oZP4VvLiEyrFqkFjP4CZn55mjYYBMREK5Wd6m",
    },
    modelManifestUrl:
      "https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/provider/model-manifest.json",
    links: {
      marketingSite: "https://t3.codes",
      privacyPolicy: "https://t3.codes/privacy-policy",
      download: "https://t3.codes/download",
      mobileApp: "https://t3.codes/mobile",
      androidStore: "https://play.google.com/store/apps/details?id=com.t3tools.t3code",
      iosStore: "https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824",
      issues: "https://github.com/pingdotgg/t3code/issues/new",
      installSh: "https://t3.codes/install.sh",
      installPs1: "https://t3.codes/install.ps1",
    },
    desktop: {
      appId: "com.t3tools.t3code",
      devAppId: "com.t3tools.t3code.dev",
      productName: "T3 Code (Beta)",
      nightlyProductName: "T3 Code (Nightly)",
      artifactBaseName: "T3-Code",
      userDataDirName: "t3code-v2",
      devUserDataDirName: "t3code-dev",
      legacyUserDataDirName: "T3 Code (Alpha)",
      devLegacyUserDataDirName: "T3 Code (Dev)",
      legacyLocalStorageProfileNames: ["T3 Code (Alpha)", "t3code"],
      appUserModelId: "com.t3tools.t3code",
      devAppUserModelId: "com.t3tools.t3code.dev",
      macPasskeys: true,
      author: "T3 Tools",
      homepage: "https://t3.codes",
      description:
        "T3 Code is an open-source desktop app for coding agents. Work with your existing agent subscriptions, review code changes, and run commands in your projects. Connect from desktop, web, or mobile to continue working remotely.",
      aboutCredits: null,
      assetDir: null,
    },
    service: {
      launchdLabel: "com.t3tools.t3code.service",
      systemdUnitName: "t3code.service",
    },
    managedPolicy: {
      macDomain: "com.t3tools.t3code",
      windowsSubkey: "SOFTWARE\\Policies\\T3Tools\\T3Code",
    },
    mobile: {
      expoSlug: "t3-code",
      appName: "T3 Code",
      androidPackage: "com.t3tools.t3code",
      iosBundleIdentifier: "com.t3tools.t3code",
      easProjectId: "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
      easOwner: "pingdotgg",
      updatesUrl: "https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454",
      hostedLinkHost: "app.t3.codes",
      relyingParty: "clerk.t3.codes",
      appleTeamId: "ARK85ZXQ4Z",
    },
    git: { committerName: "T3 Code", committerEmail: "noreply@t3.codes" },
  };
}

export const UPSTREAM_BRAND = /* @__PURE__ */ defineUpstreamBrand();
export const STANDALONE_BRAND = /* @__PURE__ */ defineStandaloneBrand();

export { defineStandaloneBrand };

export function resolveBrandProfile(id: string | undefined): BrandProfile {
  switch (id) {
    case undefined:
    case "upstream":
      return UPSTREAM_BRAND;
    case "standalone":
      return STANDALONE_BRAND;
    default:
      throw new Error(
        `Unknown T3CODE_BRAND ${JSON.stringify(id)}; expected upstream or standalone.`,
      );
  }
}
