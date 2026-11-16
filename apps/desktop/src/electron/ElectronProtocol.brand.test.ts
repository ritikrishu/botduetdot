import { assert, it, vi } from "vite-plus/test";
vi.mock("electron", () => ({}));
vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  const { STANDALONE_BRAND } = await import("@t3tools/contracts/brandProfiles");
  return { ...original, BRAND: STANDALONE_BRAND };
});
import { getDesktopScheme, getDesktopUrl } from "./ElectronProtocol.ts";
it("uses standalone renderer origins and protocol registrations", () => {
  assert.equal(getDesktopScheme(false), "botduetdot");
  assert.equal(getDesktopScheme(true), "botduetdot-dev");
  assert.equal(getDesktopUrl(false), "botduetdot://app/");
  assert.equal(getDesktopUrl(true), "botduetdot-dev://app/");
});
