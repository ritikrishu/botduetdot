import { expect, it, vi } from "vite-plus/test";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./httpCors.ts");
}

it.each(["upstream", "standalone"] as const)(
  "%s allows only the intended desktop renderer origins",
  async (id) => {
    const { DESKTOP_RENDERER_ORIGINS } = await loadBrand(id);
    expect(new Set(DESKTOP_RENDERER_ORIGINS)).toEqual(
      new Set(
        id === "upstream"
          ? ["t3code://app", "t3code-dev://app"]
          : ["botduetdot://app", "botduetdot-dev://app", "t3code://app", "t3code-dev://app"],
      ),
    );
    for (const origin of [
      "t3code-attacker://app",
      "botduetdot-attacker://app",
      "t3code-preview://app",
      "botduetdot-preview://app",
      "t3code://other",
      "botduetdot://other",
      "https://app.t3.codes",
    ]) {
      expect(DESKTOP_RENDERER_ORIGINS).not.toContain(origin);
    }
  },
);
