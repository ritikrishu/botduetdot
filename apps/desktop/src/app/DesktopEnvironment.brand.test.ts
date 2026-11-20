import { assert, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

vi.mock("@t3tools/contracts/brand", async (importOriginal) => {
  const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
  const { STANDALONE_BRAND } = await import("@t3tools/contracts/brandProfiles");
  return { ...original, BRAND: STANDALONE_BRAND };
});
import { resolveDesktopAppBranding, resolveDesktopRuntimeName } from "./DesktopEnvironment.ts";

// The runtime name names the macOS "<name> Safe Storage" Keychain item; it is fixed for life.
it("names standalone release builds without a stage", () => {
  for (const appVersion of ["0.1.9-botduetdot.1", "0.0.43-nightly.20260929.2428"]) {
    const branding = resolveDesktopAppBranding({ isDevelopment: false, appVersion });
    assert.equal(branding.displayName, "BotDuetDot");
    assert.equal(resolveDesktopRuntimeName(branding), "BotDuetDot");
  }
});

it("keeps the Dev stage for standalone development builds", () => {
  const branding = resolveDesktopAppBranding({ isDevelopment: true, appVersion: "0.1.9" });
  assert.equal(branding.displayName, "BotDuetDot (Dev)");
  assert.equal(resolveDesktopRuntimeName(branding), "BotDuetDot Dev");
});
