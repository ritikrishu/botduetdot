// @effect-diagnostics nodeBuiltinImport:off -- Runs the generated remote script in a temporary home.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it, vi } from "vite-plus/test";

async function loadBrand(id: "upstream" | "standalone") {
  vi.resetModules();
  vi.doMock("@t3tools/contracts/brand", async (importOriginal) => {
    const original = await importOriginal<typeof import("@t3tools/contracts/brand")>();
    return { ...original, BRAND: original.resolveBrandProfile(id) };
  });
  return import("./sshDeviceScript.ts");
}

it.each(["upstream", "standalone"] as const)(
  "%s keeps remote device state in its own home",
  async (id) => {
    const { remoteDeviceScript } = await loadBrand(id);
    const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "brand-device-"));
    const ownHome = id === "upstream" ? ".t3" : ".botduetdot";
    const otherHome = id === "upstream" ? ".botduetdot" : ".t3";
    try {
      await NodeFSP.mkdir(NodePath.join(home, otherHome));
      await NodeFSP.writeFile(NodePath.join(home, otherHome, "sentinel"), "untouched");
      const result = NodeChildProcess.spawnSync(process.execPath, [], {
        input: remoteDeviceScript("brand-owner", "stop"),
        env: { HOME: home, PATH: "" },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(await NodeFSP.readdir(NodePath.join(home, ownHome, "device", "hosts"))).toEqual([
        "brand-owner",
      ]);
      expect(await NodeFSP.readdir(NodePath.join(home, otherHome))).toEqual(["sentinel"]);
      expect(await NodeFSP.readFile(NodePath.join(home, otherHome, "sentinel"), "utf8")).toBe(
        "untouched",
      );
    } finally {
      await NodeFSP.rm(home, { recursive: true, force: true });
    }
  },
);
