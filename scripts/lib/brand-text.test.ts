// @effect-diagnostics nodeBuiltinImport:off - Source-map fixtures use Node's standard decoder.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import { STANDALONE_BRAND, UPSTREAM_BRAND } from "@t3tools/contracts/brandProfiles";
import { describe, expect, it } from "vite-plus/test";
import {
  BRAND_TEXT_EXCLUSIONS,
  brandTextPlugin,
  brandTextPlugins,
  isBrandTextSource,
  prepareOfficialBrandSource,
  rewriteBrandText,
} from "./brand-text.ts";

const root = NodePath.resolve(import.meta.dirname, "../..");
const filename = NodePath.join(root, "apps/web/src/example.tsx");
const transform = (code: string, id = filename) =>
  brandTextPlugin(STANDALONE_BRAND).transform(code, id);

describe("bundle-time brand text", () => {
  const code =
    '// T3 Code\nconst message = "T3 Code could not add the project";\nconst prompt = `Update T3 Code`;\nconst jsx = <p title="T3 Code">T3 Code</p>;';

  it("leaves upstream code and build options unchanged", () => {
    expect(rewriteBrandText(code, UPSTREAM_BRAND)).toBe(code);
    expect(brandTextPlugin(UPSTREAM_BRAND).transform(code, filename)).toBeUndefined();
    expect(brandTextPlugins({})).toEqual([]);
    expect(brandTextPlugins({ T3CODE_BRAND: "upstream" })).toEqual([]);
    expect(brandTextPlugins({ T3CODE_BRAND: "standalone" })).toHaveLength(1);
    expect(transform('export const x = "unchanged";')).toBeUndefined();
  });

  it("rewrites all literal occurrences without affecting internal namespaces or newlines", () => {
    expect(rewriteBrandText(code, STANDALONE_BRAND)).toBe(code.replaceAll("T3 Code", "BotDuetDot"));
    expect(transform(code)?.code).toBe(rewriteBrandText(code, STANDALONE_BRAND));
    expect(rewriteBrandText('"T3Code"; "t3code"; /T3 Code/;', STANDALONE_BRAND)).toBe(
      '"T3Code"; "t3code"; /BotDuetDot/;',
    );
  });

  it("renames the CLI only in quoted copy for its real subcommands", () => {
    const copy =
      'm("Run `t3 service install`; the `t3` launcher"); n(`Run \\`t3 update --channel x\\`.`);';
    expect(rewriteBrandText(copy, STANDALONE_BRAND)).toBe(
      'm("Run `botduetdot service install`; the `botduetdot` launcher"); n(`Run \\`botduetdot update --channel x\\`.`);',
    );
    for (const kept of [
      "const message = `t3 checkpoint ref=${ref}`;",
      "log(`t3 and its background service are current`);",
      'x("`t3 uploads`"); const t3 = 1; "t3code.preferences"; `${t3} service`;',
    ])
      expect(rewriteBrandText(kept, STANDALONE_BRAND)).toBe(kept);
    expect(rewriteBrandText(copy, UPSTREAM_BRAND)).toBe(copy);
    expect(transform('const hint = "Run `t3 up` first";')?.code).toBe(
      'const hint = "Run `botduetdot up` first";',
    );
  });

  it("limits rewriting to repository source, including queries and Windows paths", () => {
    for (const path of [
      "apps/web/src/a.tsx",
      "apps/mobile/src/a.ts",
      "apps/server/src/a.ts",
      "apps/desktop/src/a.ts",
      "packages/shared/src/a.ts?raw",
      "packages/provider-pi/src/a.ts",
    ]) {
      expect(isBrandTextSource(`${root}/${path}`)).toBe(true);
      expect(isBrandTextSource(`C:\\repo\\${path.replaceAll("/", "\\")}`, "C:\\repo")).toBe(true);
    }
    for (const path of [
      "node_modules/apps/web/src/a.ts",
      "apps/web/src/node_modules/a.ts",
      "apps/web/vite.config.ts",
      "scripts/lib/a.ts",
      "packages/contracts/src/brand.ts",
      "packages/contracts/src/brandProfiles.ts",
      "packages/contracts/src/brandStandalone.ts",
      "../other/apps/web/src/a.ts",
      ...Object.keys(BRAND_TEXT_EXCLUSIONS),
    ]) {
      expect(isBrandTextSource(`${root}/${path}`)).toBe(false);
    }
    expect(isBrandTextSource(`\0${filename}`)).toBe(false);
    expect(transform(code, `${root}/packages/contracts/src/brandStandalone.ts`)).toBeUndefined();
  });

  it("keeps original UTF-16 columns and lines after multiple replacements", () => {
    const source =
      'const a = "😀 T3 Code"; const b = "`t3 up` T3 Code";\r\n\nthrow new Error("`t3` T3 Code");';
    const result = transform(source)!;
    const map = new NodeModule.SourceMap({ ...result.map!, file: filename, sourceRoot: "" });
    const before = source.split("\n");
    const after = result.code.split("\n");
    expect(after).toHaveLength(before.length);
    for (const [line, text] of after.entries()) {
      for (const token of ["const b", ";", "throw", "Error", ");"]) {
        const column = text.indexOf(token);
        if (column < 0) continue;
        const entry = map.findEntry(line, column) as NodeModule.SourceMapping;
        expect(entry.originalLine).toBe(line);
        expect(entry.originalColumn).toBe(before[line]!.indexOf(token));
      }
    }
    expect(result.map!.sourcesContent).toEqual([source]);
  });

  it("omits official-product comments without rebranding them", () => {
    for (const relative of Object.keys(BRAND_TEXT_EXCLUSIONS).filter(
      (path) => !path.endsWith("/definition.ts"),
    )) {
      const file = NodePath.join(root, relative);
      const source = NodeFS.readFileSync(file, "utf8");
      const result = transform(source, file)!;
      expect(result.code).not.toContain("T3 Code");
      expect(result.code).not.toContain("BotDuetDot");
      expect(result.code.split("\n").map((line) => line.length)).toEqual(
        source.split("\n").map((line) => line.length),
      );
      expect(result.map).toBeNull();
    }
  });

  it("rewrites the dormant GitHub offer normally without dropping its metadata", () => {
    const file = NodePath.join(root, "packages/source-control-github/src/shared/definition.ts");
    const source = NodeFS.readFileSync(file, "utf8");
    expect(prepareOfficialBrandSource(source, file, UPSTREAM_BRAND)).toBe(source);
    expect(prepareOfficialBrandSource(source, file, STANDALONE_BRAND)).toBe(source);
    const result = transform(source, file)!;
    expect(result.code).toBe(source.replaceAll("T3 Code", "BotDuetDot"));
    expect(result.code).toContain('appName: "BotDuetDot for GitHub"');
    expect(result.code).toContain("appSignIn: APP_SIGN_IN");
  });
});
