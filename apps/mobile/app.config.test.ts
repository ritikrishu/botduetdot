import { DEFAULT_HOSTED_APP_URL } from "@t3tools/shared/connectAuth";
import { afterEach, expect, it, vi } from "vite-plus/test";

import appleAppSiteAssociation from "../web/public/.well-known/apple-app-site-association.json";
import assetLinks from "../web/public/.well-known/assetlinks.json";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({
    APP_VARIANT: process.env.APP_VARIANT,
    T3CODE_IOS_PERSONAL_TEAM: process.env.T3CODE_IOS_PERSONAL_TEAM,
    T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID: process.env.T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID,
    T3CODE_IOS_PERSONAL_TEAM_ID: process.env.T3CODE_IOS_PERSONAL_TEAM_ID,
    T3CODE_MOBILE_UPDATES_ENABLED: process.env.T3CODE_MOBILE_UPDATES_ENABLED,
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each(
  [
    [undefined, "com.t3tools.t3code"],
    ["development", "com.t3tools.t3code.dev"],
    ["preview", "com.t3tools.t3code.preview"],
    ["production", "com.t3tools.t3code"],
  ].flatMap(([variant, identifier]) =>
    [undefined, "0", "1"].flatMap((personalTeam) =>
      [undefined, "  ", " PERSONAL123 "].flatMap((teamId) =>
        [undefined, "0", "1", "true"].map((updates) => ({
          variant,
          identifier,
          personalTeam,
          teamId,
          updates,
        })),
      ),
    ),
  ),
)(
  "resolves variant and Personal Team config: %j",
  async ({ variant, identifier, personalTeam, teamId, updates }) => {
    vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM", personalTeam);
    vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID", " com.example.t3code.preview ");
    vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM_ID", teamId);
    vi.stubEnv("T3CODE_MOBILE_UPDATES_ENABLED", updates);
    const config = await loadConfig(variant);
    const isPersonalTeam = personalTeam === "1";
    const bundleIdentifier = isPersonalTeam ? "com.example.t3code.preview" : identifier;
    expect(config.ios?.bundleIdentifier).toBe(bundleIdentifier);
    expect(config.android?.package).toBe(identifier);
    expect(config.ios?.appleTeamId).toBe(
      isPersonalTeam ? teamId?.trim() || undefined : "ARK85ZXQ4Z",
    );
    expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
      `$(AppIdentifierPrefix)${bundleIdentifier}`,
    ]);
    expect(config.updates?.enabled).toBe(isPersonalTeam ? updates === "1" : updates !== "0");
    // Copied thread links open this app only while app.t3.codes lists it.
    const host = new URL(DEFAULT_HOSTED_APP_URL).host;
    if (isPersonalTeam) {
      expect(config.ios?.associatedDomains).toBeUndefined();
      expect(config.ios?.entitlements?.["com.apple.developer.associated-domains"]).toBeUndefined();
    } else {
      expect(config.ios?.associatedDomains).toEqual([
        "applinks:clerk.t3.codes",
        "webcredentials:clerk.t3.codes",
        `applinks:${host}`,
      ]);
      expect(appleAppSiteAssociation.applinks.details[0]?.appIDs).toContain(
        `${config.ios?.appleTeamId}.${identifier}`,
      );
    }
    expect(config.android?.intentFilters?.[0]?.data).toEqual([
      { scheme: "https", host, pathPrefix: "/threads/" },
    ]);
    expect(assetLinks.map((link) => link.target.package_name)).toContain(identifier);
  },
);
