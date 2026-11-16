import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import { expect, it } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
type StringsXml = { resources: { string?: { $: { name: string }; _: string }[] } };
const { excludeObserve, nativeBrandStrings, overrideNativeBrandStrings } =
  require("./withStandaloneIsolation.cjs") as {
    excludeObserve: (contents: string) => string;
    nativeBrandStrings: () => Record<string, string>;
    overrideNativeBrandStrings: (strings: StringsXml) => StringsXml;
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

it("overrides every native brand string the modules default to upstream values", () => {
  expect(nativeBrandStrings()).toEqual({
    t3_pictures_album: "BotDuetDot",
    t3_clipboard_label: "BotDuetDot",
    t3_hosted_thread_link_prefix: "https://app.botduetdot.invalid/threads/",
  });
  const strings = overrideNativeBrandStrings({
    resources: { string: [{ $: { name: "app_name" }, _: "BotDuetDot" }] },
  });
  const values = Object.fromEntries(
    (strings.resources.string ?? []).map((item) => [item.$.name, item._]),
  );
  expect(values).toMatchObject({ app_name: "BotDuetDot", ...nativeBrandStrings() });
  // Every resource the Kotlin modules declare must be overridden here.
  const declared = ["t3-native-controls", "t3-composer-editor"].flatMap((module) =>
    [
      ...NodeFS.readFileSync(
        new URL(`../modules/${module}/android/src/main/res/values/strings.xml`, import.meta.url),
        "utf8",
      ).matchAll(/<string name="([^"]+)"/g),
    ].map((match) => match[1]),
  );
  expect(declared.toSorted()).toEqual(Object.keys(nativeBrandStrings()).toSorted());
});
