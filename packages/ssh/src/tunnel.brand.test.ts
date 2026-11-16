// @effect-diagnostics nodeBuiltinImport:off - Executes the generated runner against a temporary home.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.doUnmock("@t3tools/contracts/brand");
  vi.resetModules();
});

it.each([UPSTREAM_BRAND, STANDALONE_BRAND])(
  "$id SSH runner uses only its own cached runtime",
  async (brand) => {
    vi.doMock(import("@t3tools/contracts/brand"), async (importOriginal) => ({
      ...(await importOriginal()),
      BRAND: brand,
    }));
    const { buildRemoteT3RunnerScript } = await import("./tunnel.ts");
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "brand-ssh-runner-"));
    try {
      for (const profile of [UPSTREAM_BRAND, STANDALONE_BRAND]) {
        const runtime = NodePath.join(root, profile.homeDirName, "runtime", "versions", "1.2.3");
        NodeFS.mkdirSync(runtime, { recursive: true });
        NodeFS.writeFileSync(NodePath.join(runtime, ".install-complete"), "1.2.3");
        NodeFS.writeFileSync(NodePath.join(runtime, "t3"), `#!/bin/sh\necho ${profile.id}\n`, {
          mode: 0o755,
        });
      }
      const script = buildRemoteT3RunnerScript({ archiveVersion: "1.2.3" });
      expect(script).not.toContain("@@T3_HOME_DIR@@");
      const result = NodeChildProcess.spawnSync("sh", ["-s", "--", "--version"], {
        input: script,
        encoding: "utf8",
        env: { HOME: root, PATH: process.env.PATH ?? "/usr/bin:/bin" },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(brand.id);
      for (const profile of [UPSTREAM_BRAND, STANDALONE_BRAND]) {
        expect(NodeFS.readdirSync(NodePath.join(root, profile.homeDirName))).toEqual(["runtime"]);
      }
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  },
);
