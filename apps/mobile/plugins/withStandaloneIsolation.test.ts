import * as NodeModule from "node:module";
import { expect, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const { excludeObserve } = require("./withStandaloneIsolation.cjs") as {
  excludeObserve: (contents: string) => string;
};

it("excludes native Observe before Expo autolinking runs, preserving other exclusions", () => {
  const template = 'expoAutolinking.exclude = ["another-module"]\nexpoAutolinking.useExpoModules()';
  const result = excludeObserve(template);
  expect(excludeObserve(result)).toBe(result);
  expect(result).toContain('expoAutolinking.exclude = ["another-module"]');
  expect(result).toContain(
    'expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ["expo-observe"]',
  );
  expect(result.indexOf('["expo-observe"]')).toBeLessThan(
    result.indexOf("expoAutolinking.useExpoModules()"),
  );
  expect(() => excludeObserve("plugins {} ")).toThrow(/autolinking call missing/);
});
