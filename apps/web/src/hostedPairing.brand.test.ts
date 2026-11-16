import { describe, expect, it, vi } from "vite-plus/test";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";

describe.each(["upstream", "standalone"] as const)("%s hosted configuration", (id) => {
  it("applies the brand policy to hosted URL and channel overrides", async () => {
    vi.resetModules();
    vi.doMock("@t3tools/contracts/brand", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@t3tools/contracts/brand")>()),
      BRAND: resolveBrandProfile(id),
    }));
    vi.stubEnv("VITE_HOSTED_APP_URL", "https://preview.t3.codes");
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "nightly");
    vi.stubEnv("VITE_HTTP_URL", "");
    vi.stubEnv("VITE_WS_URL", "");
    try {
      const { configuredHostedAppUrl, isHostedStaticApp } = await import("./hostedPairing");
      expect(configuredHostedAppUrl()).toBe(
        id === "standalone" ? "https://app.botduetdot.invalid" : "https://preview.t3.codes",
      );
      expect(isHostedStaticApp(new URL("http://192.168.1.44:3773"))).toBe(id === "upstream");
      vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "");
      expect(isHostedStaticApp(new URL("https://preview.t3.codes"))).toBe(id === "upstream");
      vi.stubEnv("VITE_HOSTED_APP_URL", "");
      expect(configuredHostedAppUrl()).toBe(resolveBrandProfile(id).hostedApp.url);
    } finally {
      vi.unstubAllEnvs();
      vi.doUnmock("@t3tools/contracts/brand");
      vi.resetModules();
    }
  });
});
