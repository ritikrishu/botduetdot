import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.doUnmock("@t3tools/contracts/brand");
  vi.resetModules();
});

it.each([
  { brand: UPSTREAM_BRAND, other: STANDALONE_BRAND },
  { brand: STANDALONE_BRAND, other: UPSTREAM_BRAND },
])("$brand.id pairing links keep the token and reject other products", async ({ brand, other }) => {
  vi.doMock(import("@t3tools/contracts/brand"), async (importOriginal) => ({
    ...(await importOriginal()),
    BRAND: brand,
  }));
  const { buildPairingAppLink, readPairingAppLink, resolveRemotePairingTarget } =
    await import("./remote.ts");
  const pairingUrl = "https://devbox.example:3773/pair#token=one-time-token";
  const query = new URLSearchParams({ pairingUrl }).toString();
  const link = buildPairingAppLink(pairingUrl);
  expect(link).toBe(`${brand.schemes.production}://pair?${query}`);
  expect(readPairingAppLink(link)).toBe(pairingUrl);
  expect(resolveRemotePairingTarget({ pairingUrl: readPairingAppLink(link)! })).toEqual({
    credential: "one-time-token",
    httpBaseUrl: "https://devbox.example:3773/",
    wsBaseUrl: "wss://devbox.example:3773/",
  });
  for (const scheme of Object.values(brand.schemes)) {
    expect(readPairingAppLink(`${scheme}://pair/?${query}`)).toBe(pairingUrl);
    expect(readPairingAppLink(`${scheme}://pair/extra?${query}`)).toBeNull();
    expect(readPairingAppLink(`${scheme}://attacker?${query}`)).toBeNull();
    expect(readPairingAppLink(`${scheme}://pair`)).toBeNull();
  }
  for (const scheme of Object.values(other.schemes)) {
    expect(readPairingAppLink(`${scheme}://pair?${query}`)).toBeNull();
  }
  for (const suffix of ["nightly", "attacker"]) {
    expect(readPairingAppLink(`${brand.slug}-${suffix}://pair?${query}`)).toBe(
      brand.id === "upstream" ? pairingUrl : null,
    );
    expect(readPairingAppLink(`${other.slug}-${suffix}://pair?${query}`)).toBeNull();
  }
  expect(readPairingAppLink(`https://pair?${query}`)).toBeNull();
});
