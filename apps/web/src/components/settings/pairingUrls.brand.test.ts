import { describe, expect, it, vi } from "vite-plus/test";
import { resolveBrandProfile } from "@t3tools/contracts/brandProfiles";

describe.each(["upstream", "standalone"] as const)("%s pairing", (id) => {
  it("uses the endpoint fallback when hosted pairing is disabled", async () => {
    vi.resetModules();
    vi.doMock("@t3tools/contracts/brand", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@t3tools/contracts/brand")>()),
      BRAND: resolveBrandProfile(id),
    }));
    vi.stubEnv("VITE_HOSTED_APP_URL", "");
    try {
      const { resolveHostedPairingUrl, resolveDesktopPairingUrl } = await import("./pairingUrls");
      for (const protocol of ["http", "https"]) {
        const endpoint = `${protocol}://workstation.tailnet.ts.net:3773`;
        const hosted = resolveHostedPairingUrl(endpoint, "PAIRCODE");
        if (id === "standalone" || protocol === "http") {
          expect(hosted).toBeNull();
          expect(hosted ?? resolveDesktopPairingUrl(endpoint, "PAIRCODE")).toBe(
            `${endpoint}/pair#token=PAIRCODE`,
          );
        } else {
          expect(hosted).toBe(
            "https://app.t3.codes/pair?host=https%3A%2F%2Fworkstation.tailnet.ts.net%3A3773#token=PAIRCODE",
          );
        }
      }
    } finally {
      vi.unstubAllEnvs();
      vi.doUnmock("@t3tools/contracts/brand");
      vi.resetModules();
    }
  });
});
