import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";
import { describe, expect, it, vi } from "vite-plus/test";

describe.each(["upstream", "standalone"] as const)("%s settings search", (id) => {
  it.each([
    { desktop: true, channel: null, upstreamVisible: true },
    { desktop: false, channel: "latest", upstreamVisible: true },
    { desktop: false, channel: null, upstreamVisible: false },
  ])(
    "gates the update track on brand and platform: %j",
    async ({ desktop, channel, upstreamVisible }) => {
      vi.resetModules();
      const brand = resolveBrandProfile(id);
      vi.doMock("@t3tools/contracts/brand", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@t3tools/contracts/brand")>()),
        BRAND: brand,
      }));
      vi.doMock("~/env", () => ({ isElectron: desktop, isSecretsFeatureEnabled: false }));
      vi.doMock("~/branding", () => ({ HOSTED_APP_CHANNEL: channel }));
      try {
        const { SETTINGS_SEARCH_ITEMS, settingsForThisPlatform, searchSettings } =
          await import("./settingsSearch");
        const tracks = SETTINGS_SEARCH_ITEMS.filter(
          (item) => "releaseChannelOnly" in item && item.releaseChannelOnly,
        );
        expect(tracks.length).toBeGreaterThan(0);
        expect(settingsForThisPlatform(tracks)).toEqual(
          id === "upstream" && upstreamVisible ? tracks : [],
        );
        expect(SETTINGS_SEARCH_ITEMS.find((item) => item.id === "cli-command")?.title).toBe(
          `${brand.cliName} command`,
        );
        if (desktop) {
          expect(
            searchSettings(`${brand.cliName} command`).some((item) => item.id === "cli-command"),
          ).toBe(true);
        }
      } finally {
        vi.doUnmock("@t3tools/contracts/brand");
        vi.doUnmock("~/env");
        vi.doUnmock("~/branding");
        vi.resetModules();
      }
    },
  );
});
