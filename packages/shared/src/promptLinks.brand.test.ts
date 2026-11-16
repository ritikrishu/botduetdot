import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.doUnmock("@t3tools/contracts/brand");
  vi.resetModules();
});

it.each([
  { brand: UPSTREAM_BRAND, other: STANDALONE_BRAND },
  { brand: STANDALONE_BRAND, other: UPSTREAM_BRAND },
])("$brand.id prompt and thread links stay inside their product", async ({ brand, other }) => {
  vi.doMock(import("@t3tools/contracts/brand"), async (importOriginal) => ({
    ...(await importOriginal()),
    BRAND: brand,
  }));
  const { buildNewThreadLink, promptLinkAppPath, promptLinkDeepLink } =
    await import("./promptLinks.ts");
  const { hostedThreadLink } = await import("./threadLinks.ts");

  for (const scheme of Object.values(brand.schemes)) {
    expect(promptLinkAppPath(`${scheme}://new?prompt=x`)).toBe("/new?prompt=x");
    expect(promptLinkAppPath(`${scheme}://threads/a/b?prompt=x`)).toBe("/a/b?prompt=x");
    expect(promptLinkAppPath(`${scheme}://new/extra?prompt=x`)).toBeNull();
    expect(promptLinkAppPath(`${scheme}://threads/a`)).toBeNull();
    expect(promptLinkAppPath(`${scheme}://app/settings`)).toBeNull();
  }
  for (const scheme of Object.values(other.schemes)) {
    expect(promptLinkAppPath(`${scheme}://new?prompt=x`)).toBeNull();
    expect(promptLinkAppPath(`${scheme}://threads/a/b`)).toBeNull();
  }
  for (const suffix of ["nightly", "attacker"]) {
    expect(promptLinkAppPath(`${brand.slug}-${suffix}://new?prompt=x`)).toBe(
      brand.id === "upstream" ? "/new?prompt=x" : null,
    );
    expect(promptLinkAppPath(`${other.slug}-${suffix}://new?prompt=x`)).toBeNull();
  }
  expect(promptLinkDeepLink("/new?prompt=x")).toBe(`${brand.schemes.production}://new?prompt=x`);
  const newLink = buildNewThreadLink({ prompt: "x" });
  expect(new URL(newLink).origin).toBe(brand.hostedApp.url);
  expect(promptLinkAppPath(newLink)).toBe("/new?prompt=x");
  const threadLink = hostedThreadLink({
    environmentId: EnvironmentId.make("a"),
    threadId: ThreadId.make("b"),
  });
  expect(new URL(threadLink).origin).toBe(brand.hostedApp.url);
  expect(promptLinkAppPath(threadLink)).toBe("/a/b");
  expect(promptLinkDeepLink("/a/b")).toBe(`${brand.schemes.production}://threads/a/b`);
  expect(promptLinkAppPath(`${other.hostedApp.url}/new?prompt=x`)).toBeNull();
  expect(promptLinkAppPath(`${other.hostedApp.url}/threads/a/b`)).toBeNull();
  expect(promptLinkAppPath(`${brand.hostedApp.url}.attacker.example/new?prompt=x`)).toBeNull();
  expect(promptLinkAppPath(`${brand.hostedApp.url}/a/b`)).toBeNull();
});
