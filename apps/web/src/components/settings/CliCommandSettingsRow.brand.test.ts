// @effect-diagnostics nodeBuiltinImport:off - checks copy seams without mounting the desktop bridge.
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";

it("brands CLI installation, shadowing, PATH advice, and failure copy", () => {
  const source = NodeFS.readFileSync(
    new URL("./CliCommandSettingsRow.tsx", import.meta.url),
    "utf8",
  );
  expect(source).toContain("Another ${BRAND.cliName} at ${state.shadowedBy}");
  expect(source).toContain("Remove it to use ${BRAND.name}'s.");
  expect(source).toContain("Run ${BRAND.name}'s CLI as ");
  expect(source).not.toMatch(/T3 Code|Could not (?:install|remove|add) t3|run `t3`/);
});
