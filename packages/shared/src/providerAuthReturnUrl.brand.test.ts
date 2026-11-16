import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.doUnmock("@t3tools/contracts/brand");
  vi.resetModules();
});

it.each([
  { brand: UPSTREAM_BRAND, other: STANDALONE_BRAND },
  { brand: STANDALONE_BRAND, other: UPSTREAM_BRAND },
])("$brand.id provider returns keep the production/dev allowlist", async ({ brand, other }) => {
  vi.doMock(import("@t3tools/contracts/brand"), async (importOriginal) => ({
    ...(await importOriginal()),
    BRAND: brand,
  }));
  const { providerAuthReturnUrl } = await import("./providerAuthReturnUrl.ts");

  for (const origin of [
    `${brand.schemes.production}://app`,
    `${brand.schemes.development}://app`,
    brand.hostedApp.url,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://[::1]:3000",
  ]) {
    expect(providerAuthReturnUrl(`${origin}/welcome?code=secret#agents:remote`)).toBe(
      `${origin}/welcome#agents:remote`,
    );
    expect(
      providerAuthReturnUrl(`${origin}/settings/providers?instanceId=work&code=secret#secret`),
    ).toBe(`${origin}/settings/providers?instanceId=work`);
    expect(providerAuthReturnUrl(`${origin}/new?prompt=x`)).toBeUndefined();
    expect(
      providerAuthReturnUrl(`${origin.replace("://", "://user:pass@")}/welcome`),
    ).toBeUndefined();
  }
  for (const scheme of [
    brand.schemes.preview,
    `${brand.slug}-nightly`,
    `${brand.slug}-attacker`,
    other.schemes.production,
    other.schemes.development,
    other.schemes.preview,
    `${other.slug}-attacker`,
  ]) {
    expect(providerAuthReturnUrl(`${scheme}://app/welcome`)).toBeUndefined();
  }
  for (const origin of [
    other.hostedApp.url,
    `http://${new URL(brand.hostedApp.url).host}`,
    `${brand.hostedApp.url}.attacker.example`,
    `${brand.schemes.production}://attacker`,
    "https://nightly.app.t3.codes",
  ]) {
    expect(providerAuthReturnUrl(`${origin}/welcome`)).toBeUndefined();
  }
});
