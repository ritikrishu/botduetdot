import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import {
  STANDALONE_BRAND,
  UPSTREAM_BRAND,
  type BrandProfile,
} from "@t3tools/contracts/brandProfiles";
import { expect, it, vi } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
type Args = { src: string; filename: string; options: object; plugins?: unknown[] };
type Result = { code: string; map: NodeModule.SourceMapPayload };
type Transformer = { transform: (args: Args) => Result; getCacheKey: () => string };
const { createBrandTransformer } = require("./transformer.cjs") as {
  createBrandTransformer: (delegate: Transformer, brand: BrandProfile) => Transformer;
};
const { transformSync } = require("@babel/core") as {
  transformSync: (src: string, options: object) => Result;
};
const filename = NodePath.resolve(import.meta.dirname, "../src/example.tsx");
const args: Args = { src: 'const x = "T3 Code";', filename, options: {} };

it("delegates upstream and excluded modules unchanged, with separate brand cache keys", () => {
  const result = { code: "unchanged", map: {} as NodeModule.SourceMapPayload };
  const delegate = { transform: vi.fn((_args: Args) => result), getCacheKey: () => "expo-key" };
  const upstream = createBrandTransformer(delegate, UPSTREAM_BRAND);
  expect(upstream.transform(args)).toBe(result);
  expect(delegate.transform.mock.calls[0]?.[0]).toBe(args);
  const standalone = createBrandTransformer(delegate, STANDALONE_BRAND);
  for (const path of ["node_modules/lib/index.js", "packages/contracts/src/brandStandalone.ts"]) {
    const excluded = { ...args, filename: NodePath.resolve(import.meta.dirname, "../../..", path) };
    expect(standalone.transform(excluded)).toBe(result);
    expect(delegate.transform).toHaveBeenLastCalledWith(excluded);
  }
  expect(standalone.getCacheKey()).not.toBe(upstream.getCacheKey());
});

it("rewrites Metro strings, templates, regexes and JSX while preserving source positions", () => {
  const delegate: Transformer = {
    getCacheKey: () => "expo-key",
    transform: ({ src, filename, plugins }) =>
      transformSync(src, {
        filename,
        plugins,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: { plugins: ["jsx", "typescript"] },
      }),
  };
  const transformer = createBrandTransformer(delegate, STANDALONE_BRAND);
  const src =
    'const label = "T3 Code"; const next = 1;\nconst prompt = `T3 Code ${next}`;\nconst jsx = <p title="T3 Code">T3 Code</p>;\nconst re = /T3 Code/;\nconst pair = <p>Scan the code from t3 pair</p>;';
  const result = transformer.transform({ ...args, src });
  expect(result.code).not.toContain("T3 Code");
  expect(result.code).toContain("Scan the code from botduetdot pair");
  expect(result.code.match(/BotDuetDot/g)).toHaveLength(5);
  const lines = result.code.split("\n");
  const line = lines.findIndex((text) => text.includes("const next"));
  const map = new NodeModule.SourceMap(result.map);
  const entry = map.findEntry(line, lines[line]!.indexOf("const next")) as NodeModule.SourceMapping;
  expect(entry.originalLine).toBe(0);
  expect(entry.originalColumn).toBe(src.indexOf("const next"));
});

it("renames t3@ labels across template expressions but leaves npm commands", () => {
  const delegate: Transformer = {
    getCacheKey: () => "expo-key",
    transform: ({ src, filename, plugins }) =>
      transformSync(src, {
        filename,
        plugins,
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ["typescript"] },
      }),
  };
  const transformer = createBrandTransformer(delegate, STANDALONE_BRAND);
  const src = [
    "const v = '1';",
    "const runner = 'npx';",
    "const a = `Reconnected on t3@${v}. Use a separate T3 home.`;",
    "const b = `${runner} t3@${v}`;",
    "const c = `npx t3@${v} pair`;",
    "const d = `t3@${v} is a preview build.`;",
    "const e = `t3 update`;",
    "const f = `t3`;",
    "const g = `t3 pair --base-dir ${v}`;",
  ].join("\n");
  const code = transformer.transform({ ...args, src }).code;
  expect(code).toContain("Reconnected on botduetdot@${v}. Use a separate BotDuetDot home.");
  expect(code).toContain("${runner} t3@${v}");
  expect(code).toContain("npx t3@${v} pair");
  expect(code).toContain("`botduetdot@${v} is a preview build.`");
  // A template's own backticks count, as in the plain-text rewrite of the other bundles.
  expect(code).toContain("const e = `botduetdot update`;");
  expect(code).toContain("const f = `botduetdot`;");
  expect(code).toContain("const g = `botduetdot pair --base-dir ${v}`;");
});
