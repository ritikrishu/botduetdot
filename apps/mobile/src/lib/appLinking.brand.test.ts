import { expect, it, vi } from "vite-plus/test";
vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  return { ...original, BRAND: original.STANDALONE_BRAND };
});
import { shouldHandleAppLink } from "./appLinking";
it("ignores bare standalone scheme launches and still opens their routes", () => {
  for (const url of ["botduetdot://", "botduetdot:", "botduetdot-dev:///", "botduetdot-preview://"])
    expect(shouldHandleAppLink(url, false)).toBe(false);
  expect(shouldHandleAppLink("botduetdot://new?prompt=hi", false)).toBe(true);
  // The official app's bare launch is not this app's lifecycle URL.
  expect(shouldHandleAppLink("t3code://", false)).toBe(true);
});
