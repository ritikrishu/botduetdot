import { expect, it, vi } from "vite-plus/test";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./bootService.ts");
}

it.each(["upstream", "standalone"] as const)(
  "%s installs a separate service identity",
  async (id) => {
    const service = await loadBrand(id);
    const label =
      id === "upstream" ? "com.t3tools.t3code.service" : "com.ritikrishu.botduetdot.service";
    expect(service.BOOT_SERVICE_LAUNCHD_LABEL).toBe(label);
    expect(service.BOOT_SERVICE_PLIST_FILE).toBe(`${label}.plist`);
    expect(service.BOOT_SERVICE_UNIT_FILE).toBe(
      id === "upstream" ? "t3code.service" : "botduetdot.service",
    );
    const plist = service.renderBootServicePlist(
      {
        program: ["/brand/cli", "__service-launcher"],
        baseDir: "/brand/home",
        logPath: "/brand/log",
        unitPath: `/LaunchAgents/${label}.plist`,
      },
      { homeDir: "/brand", environmentPath: "/usr/bin" },
    );
    expect(plist).toContain(`<string>${label}</string>`);
    expect(service.bootServiceBaseDirOf(plist)).toBe("/brand/home");
  },
);
