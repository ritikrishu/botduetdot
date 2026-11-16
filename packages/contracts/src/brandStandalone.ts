import type { BrandProfile } from "./brandProfiles.ts";

export function defineStandaloneBrand(): BrandProfile {
  const name = "BotDuetDot";
  const slug = "botduetdot";
  const reverseDns = "com.ritikrishu.botduetdot";
  const repository = "ritikrishu/botduetdot";
  const siteUrl = "https://ritikrishu.github.io/botduetdot/";
  const hostedAppUrl = "https://app.botduetdot.invalid";
  const author = "ritikrishu";

  const repositoryUrl = `https://github.com/${repository}`;
  const androidStore = `https://play.google.com/store/apps/details?id=${reverseDns}`;

  return {
    id: "standalone",
    name,
    slug,
    homeDirName: `.${slug}`,
    cliName: slug,
    repository,
    schemes: {
      production: slug,
      development: `${slug}-dev`,
      preview: `${slug}-preview`,
    },
    hostedApp: { url: hostedAppUrl, nightlyUrl: null, pairingLinks: false },
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
      marketingSite: siteUrl,
      privacyPolicy: `${siteUrl}privacy-policy`,
      download: `${repositoryUrl}/releases/latest`,
      mobileApp: androidStore,
      androidStore,
      iosStore: null,
      issues: `${repositoryUrl}/issues`,
      installSh: null,
      installPs1: null,
    },
    desktop: {
      appId: reverseDns,
      devAppId: `${reverseDns}.dev`,
      productName: name,
      nightlyProductName: name,
      artifactBaseName: name,
      userDataDirName: slug,
      devUserDataDirName: `${slug}-dev`,
      legacyUserDataDirName: null,
      legacyLocalStorageProfileNames: [],
      appUserModelId: reverseDns,
      devAppUserModelId: `${reverseDns}.dev`,
      macPasskeys: false,
      author,
      homepage: siteUrl,
      description: `${name} is an open-source desktop app for coding agents. Work with your existing agent subscriptions, review code changes, and run commands in your projects. Connect from desktop, web, or mobile to continue working remotely.`,
      aboutCredits: "Based on T3 Code © 2026 T3 Tools Inc. (MIT License)",
      assetDir: "assets/brand/standalone",
    },
    service: {
      launchdLabel: `${reverseDns}.service`,
      systemdUnitName: `${slug}.service`,
    },
    managedPolicy: {
      macDomain: reverseDns,
      windowsSubkey: `SOFTWARE\\Policies\\${author}\\${name}`,
    },
    mobile: {
      appName: name,
      androidPackage: reverseDns,
      iosBundleIdentifier: reverseDns,
      easProjectId: null,
      easOwner: null,
      updatesUrl: null,
      hostedLinkHost: null,
      relyingParty: null,
      appleTeamId: null,
    },
    git: { committerName: name, committerEmail: `noreply@${slug}.invalid` },
  };
}
